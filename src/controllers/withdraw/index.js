const BankAccount = require("../../models/bankAccounts");
const Withdraw = require("../../models/withdraw");
const User = require("../../models/users"); // Add this line
const { InternalServerError } = require("../../utils/errorHandler");
const mongoose = require("mongoose");
const logStatement = require("../../utils/logStatement");

const createWithdrawRequest = async (req, res) => {
  try {
    const { userId, bankAccountId, amount } = req.body;

    // Validate inputs
    if (!userId || !bankAccountId || !amount || amount <= 0) {
      return res.status(400).json({
        status: false,
        message: "Invalid input data.",
      });
    }

    // Check if the withdrawal amount is within the allowed range (₹200 - ₹10,000)
    if (amount < 200) {
      return res.status(400).json({
        status: false,
        message: "Minimum withdrawal amount is ₹200.",
      });
    }

    if (amount > 10000) {
      return res.status(400).json({
        status: false,
        message: "Withdrawal amount must be less than ₹10,000.",
      });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found.",
      });
    }

    // Check if the user has sufficient balance
    if (user.availableBalance < amount) {
      return res.status(400).json({
        status: false,
        message: `Insufficient balance. You have ₹${user.availableBalance} available and ₹${user.bonusAmount} in bonus.`,
      });
    }

    const walletBefore = user.balance;

    // Deduct the amount from the user's available balance
    try {
      user.availableBalance -= amount;
      user.balance = user.availableBalance + user.bonusAmount;
      await user.save();
    } catch (deductionError) {
      return res.status(500).json({
        status: false,
        message: deductionError.message || "Error while updating user balance.",
      });
    }

    const walletAfter = user.balance;

    // Log statement for withdrawal request (deduction)
    await logStatement({
      userId,
      type: "withdraw_request",
      amount,
      walletBefore,
      walletAfter,
      status: "pending",
      description: "Withdrawal request created by user"
    });

    // Create a new withdraw request
    const newWithdraw = new Withdraw({
      userId,
      bankAccountId,
      amount,
      status: "pending",
    });

    await newWithdraw.save();

    return res.status(201).json({
      status: true,
      message: "Withdraw request created successfully.",
      data: newWithdraw,
    });
  } catch (error) {
    console.error("Error in createWithdrawRequest:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while creating the withdrawal request.",
    });
  }
};

const getUserWithdrawHistory = async (req, res) => {
  try {
    const userId = req.userId;

    // Fetch all withdraw requests made by the user, sorted by most recent
    const withdraws = await Withdraw.find({ userId })
      .sort({ createdAt: -1 })
      .lean(); // Convert Mongoose documents to plain JavaScript objects

    // Fetch bank account details for each withdraw
    const withdrawHistory = await Promise.all(
      withdraws.map(async (withdraw) => {
        const bankAccount = await BankAccount.findById(
          withdraw.bankAccountId
        ).lean();
        return {
          id: withdraw._id,
          date: withdraw.createdAt,
          status: withdraw.status,
          amount: withdraw.amount,
          userId: withdraw.userId,
          reason: withdraw.reason,
          bankAccountNumber: bankAccount ? bankAccount.accountNumber : null,
        };
      })
    );

    return res.status(200).json({
      status: true,
      message: "Withdraw history fetched successfully.",
      data: withdrawHistory,
    });
  } catch (error) {
    console.error("Error in getUserWithdrawHistory:", error);
    return InternalServerError(res, error);
  }
};

const getAllWithdrawRequests = async (req, res) => {
  try {
    const { status, _id } = req.query; // Get status and _id from query parameters

    let filter = {};

    // Filter by _id if provided and valid
    if (_id && mongoose.Types.ObjectId.isValid(_id)) {
      filter._id = _id;
    }

    // Convert status to an array if multiple statuses are provided (comma-separated)
    const validStatuses = ["pending", "approved", "rejected"];
    if (status) {
      const statusArray = status.split(",").map((s) => s.trim()); // Convert to array
      const filteredStatuses = statusArray.filter((s) => validStatuses.includes(s));

      if (filteredStatuses.length > 0) {
        filter.status = { $in: filteredStatuses }; // MongoDB `$in` for multiple status filtering
      }
    }

    // Fetch withdraw requests and populate user details from the Users collection
    const withdrawRequests = await Withdraw.find(filter)
      .populate({ path: "userId", model: "user", select: "Phone" }) // Fetch only the Phone field
      .sort({ createdAt: -1 })
      .lean();

    // Transform the response to extract userPhone and remove userId object
    const formattedRequests = withdrawRequests.map((request) => {
      const userPhone = request.userId?.Phone || null; // Extract phone number
      const { userId, ...rest } = request; // Remove userId
      return { ...rest, userPhone };
    });

    return res.status(200).json({
      status: true,
      message: "Withdraw requests fetched successfully.",
      data: formattedRequests,
    });
  } catch (error) {
    console.error("Error in getAllWithdrawRequests:", error);
    return InternalServerError(res, error);
  }
};


const approveWithdrawRequest = async (req, res) => {
  try {
    const { withdrawId } = req.params;

    // Find the withdraw request by ID
    const withdrawRequest = await Withdraw.findById(withdrawId);

    if (!withdrawRequest) {
      return res.status(404).json({
        status: false,
        message: "Withdraw request not found.",
      });
    }

    // Update the status to 'approved'
    withdrawRequest.status = "approved";
    await withdrawRequest.save();

    return res.status(200).json({
      status: true,
      message: "Withdraw request approved successfully.",
      data: withdrawRequest,
    });
  } catch (error) {
    console.error("Error in approveWithdrawRequest:", error);
    return InternalServerError(res, error);
  }
};
 
const rejectWithdrawRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { withdrawId } = req.params;
    const { reason } = req.body;

    // Validate reason
    if (!reason || typeof reason !== "string" || reason.trim() === "") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: false,
        message: "Rejection reason is required and must be a non-empty string.",
      });
    }

    // Find the withdraw request by ID within the transaction session
    const withdrawRequest = await Withdraw.findById(withdrawId).session(session);
    if (!withdrawRequest) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: false,
        message: "Withdraw request not found.",
      });
    }

    if (withdrawRequest.status !== "pending") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: false,
        message: "Only pending withdraw requests can be rejected.",
      });
    }

    const { userId, amount } = withdrawRequest;

    // Find the user within the transaction session
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: false,
        message: "User associated with the withdraw request not found.",
      });
    }

    const walletBefore = user.balance;

    // Refund the amount to the user's balance
    user.availableBalance += amount;
    user.balance += amount;
    await user.save({ session });

    // Update the status to 'rejected' and save the reason
    withdrawRequest.status = "rejected";
    withdrawRequest.reason = reason.trim();
    await withdrawRequest.save({ session });

    const walletAfter = user.balance;

    // Log the refund to the statement
    await logStatement({
      userId,
      type: "withdraw_reject",
      amount,
      walletBefore,
      walletAfter,
      status: "success",
      description: `Withdrawal request rejected. Reason: ${reason.trim()}`
    });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      status: true,
      message: "Withdraw request rejected and amount refunded successfully.",
      data: withdrawRequest,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error in rejectWithdrawRequest:", error);
    return InternalServerError(res, error);
  }
};

const getWithdrawTotalByDate = async (req, res) => {
  try {
    
    const { date } = req.params;

    if (!date) {
      return res
        .status(400)
        .json({ status: false, message: "Date is required in dd-MM-yyyy format" });
    }

    // Parse the date from dd-MM-yyyy to a Date object
    const [day, month, year] = date.split("-").map(Number);

    // Indian Standard Time (IST) offset is +5:30 => 19800 seconds
    // To convert IST to UTC, subtract 5.5 hours
    const startOfDayIST = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - 5.5 * 60 * 60 * 1000);
    const endOfDayIST = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - 5.5 * 60 * 60 * 1000);

    const result = await Withdraw.aggregate([
      {
        $match: {
          status: "approved",
          createdAt: {
            $gte: startOfDayIST,
            $lte: endOfDayIST,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    const totalWithdrawAmount = result[0]?.totalAmount || 0;

    return res.status(200).json({
      status: true,
      message: `Total approved withdrawals on ${date} (IST)`,
      totalWithdrawAmount,
    });
  } catch (error) {
    console.error("Error in getWithdrawTotalByDate:", error);
    return InternalServerError(res, error);
  }
};


module.exports = {
  createWithdrawRequest,
  getUserWithdrawHistory,
  getAllWithdrawRequests,
  approveWithdrawRequest,
  rejectWithdrawRequest,
  getWithdrawTotalByDate
};
