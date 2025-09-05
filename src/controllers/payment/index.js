const Payment = require("../../models/payment");
const { uploadFile } = require("../../services/s3bucket");
const { InternalServerError } = require("../../utils/errorHandler");
const mongoose = require("mongoose");
const User = require("../../models/users");
const AdminBankAccount = require("../../models/adminBankAccount");
const moment = require("moment-timezone");
const logStatement = require("../../utils/logStatement");

const addDeposit = async (req, res) => {
  try {
    const userId = req.userId;
    const { amount, utrNumber, bankId } = req.body;

    // Validate inputs
    if (!amount || amount <= 0) {
      return res.status(400).json({
        status: false,
        message: "Invalid deposit amount.",
      });
    }

    if (!utrNumber) {
      return res.status(400).json({
        status: false,
        message: "UTR number is required.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: false,
        message: "Payment screenshot is required.",
      });
    }

    // Check if UTR number already exists
    const existingPayment = await Payment.findOne({ utrNumber });
    if (existingPayment) {
      return res.status(400).json({
        status: false,
        message: "UTR number already used.",
      });
    }

    // Upload the screenshot to S3
    const file = req.file;
    const fileName = `payment_screenshots/${userId}/${Date.now()}-${
      file.originalname
    }`;
    const mimeType = file.mimetype;

    const paymentScreenshotUrl = await uploadFile(
      file.buffer,
      fileName,
      mimeType
    );

    // Create a new payment document with status 'pending'
    const newPayment = new Payment({
      userId,
      amount,
      utrNumber,
      paymentScreenshotUrl,
      status: "pending",
      bankId
    });

    await newPayment.save();

    return res.status(201).json({
      status: true,
      message: "Deposit request created successfully.",
    });
  } catch (error) {
    console.error("Error in addDeposit:", error);
    return InternalServerError(res, error);
  }
};

/**
 * Retrieves the authenticated user's complete deposit history.
 */
const getDepositHistory = async (req, res) => {
  try {
    const userId = req.userId;

    // Fetch all payments made by the user, sorted by most recent
    const payments = await Payment.find({ userId })
      .sort({ createdAt: -1 })
      .select("-__v") // Exclude the __v field
      .lean(); // Convert Mongoose documents to plain JavaScript objects

    return res.status(200).json({
      status: true,
      message: "Deposit history fetched successfully.",
      data: payments,
    });
  } catch (error) {
    console.error("Error in getDepositHistory:", error);
    return InternalServerError(res, error);
  }
};

const getAllDepositRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 10, search } = req.query;
    let filter = {};

    const validStatuses = ["pending", "approved", "rejected"];
    if (status) {
      const statusArray = status.split(",").map((s) => s.trim());
      const filteredStatuses = statusArray.filter((s) => validStatuses.includes(s));
      if (filteredStatuses.length > 0) {
        filter.status = { $in: filteredStatuses };
      }
    }

    // UTR Number Search Filtering
    if (search) {
      filter.utrNumber = { $regex: search, $options: "i" };
    }

    // Pagination
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    const skip = (pageNumber - 1) * limitNumber;

    // Fetch deposit requests with pagination
    const depositRequests = await Payment.find(filter)
      .populate({ path: "userId", model: "user", select: "Phone" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .lean();

    const totalRecords = await Payment.countDocuments(filter);

    // Transform response
    const formattedRequests = depositRequests.map((request) => {
      const userPhone = request.userId?.Phone || null;
      const { userId, ...rest } = request;
      return { ...rest, userPhone };
    });

    // 🔥 Updated IST-based day range
    const istStartOfDay = moment().tz("Asia/Kolkata").startOf('day').toDate();
    const istEndOfDay = moment().tz("Asia/Kolkata").endOf('day').toDate();

    const todayTotalAmount = await Payment.aggregate([
      {
        $match: {
          status: "approved",
          createdAt: { $gte: istStartOfDay, $lte: istEndOfDay },
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Deposit requests fetched successfully.",
      data: formattedRequests,
      pagination: {
        totalRecords,
        currentPage: pageNumber,
        pageSize: limitNumber,
      },
      todayApprovedTotal: todayTotalAmount.length > 0 ? todayTotalAmount[0].totalAmount : 0,
    });
  } catch (error) {
    console.error("Error in getAllDepositRequests:", error);
    return InternalServerError(res, error);
  }
};


/**
 * Approves a deposit request and adds the deposit amount to the user's balance.
 *
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
const approveDepositRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { depositId } = req.params;

    // Find the deposit request by ID within the transaction session
    const depositRequest = await Payment.findById(depositId).session(session);

    if (!depositRequest) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: false,
        message: "Deposit request not found.",
      });
    }

    if (depositRequest.status !== "pending") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: false,
        message: "Only pending deposit requests can be approved.",
      });
    }

    const { userId, amount } = depositRequest;

    // Find the user within the transaction session
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: false,
        message: "User associated with the deposit request not found.",
      });
    }

    const walletBefore = user.balance; // Capture balance before update

    // Add the deposit amount to the user's balance
    await user.addBalance(amount, { session });

    const walletAfter = walletBefore + amount; // Balance after update

    // Log to account statement
    await logStatement({
      userId,
      type: "deposit",
      amount,
      walletBefore,
      walletAfter,
      status: "success",
      description: "Deposit approved by admin"
    });

    // Find an active bank account
    const activeBankAccount = await AdminBankAccount.findOne({ isActive: true }).session(session);

    if (!activeBankAccount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: false,
        message: "No active bank account found.",
      });
    }

    // Ensure totalDepositeAdded exists in the bank account
    if (typeof activeBankAccount.totalDepositeAdded === "undefined") {
      activeBankAccount.totalDepositeAdded = 0;
    }

    // Update the bank account's total amount added
    activeBankAccount.totalDepositeAdded += amount;
    await activeBankAccount.save({ session });

    // Update the deposit request status to 'approved'
    depositRequest.status = "approved";
    await depositRequest.save({ session });

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      status: true,
      message: "Deposit request approved, balance updated, and amount added to the bank account.",
      data: depositRequest,
    });
  } catch (error) {
    // If any error occurs, abort the transaction
    await session.abortTransaction();
    session.endSession();
    console.error("Error in approveDepositRequest:", error);
    return InternalServerError(res, error);
  }
};

/**
 * Rejects a deposit request by updating its status to 'rejected' and recording the reason.
 *
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
const rejectDepositRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { depositId } = req.params;
    const { reason } = req.body;

    // Validate reason
    // if (!reason || typeof reason !== "string" || reason.trim() === "") {
    //   await session.abortTransaction();
    //   session.endSession();
    //   return res.status(400).json({
    //     status: false,
    //     message: "Rejection reason is required and must be a non-empty string.",
    //   });
    // }

    // Find the deposit request by ID within the transaction session
    const depositRequest = await Payment.findById(depositId).session(session);

    if (!depositRequest) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: false,
        message: "Deposit request not found.",
      });
    }

    if (depositRequest.status !== "pending") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: false,
        message: "Only pending deposit requests can be rejected.",
      });
    }

    // Update the status to 'rejected' and save the reason
    depositRequest.status = "rejected";
    depositRequest.reason = reason.trim();
    await depositRequest.save({ session });

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      status: true,
      message: "Deposit request rejected successfully.",
      data: depositRequest,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error in rejectDepositRequest:", error);
    return InternalServerError(res, error);
  }
};

module.exports = {
  addDeposit,
  getDepositHistory,
  getAllDepositRequests,
  approveDepositRequest,
  rejectDepositRequest,
};
