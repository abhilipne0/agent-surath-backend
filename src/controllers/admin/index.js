const Admin = require("../../models/admin");
const mongoose = require('mongoose');
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const deposite = require("../../models/payment");
const Withdraw = require("../../models/withdraw");
const upideposites = require("../../models/upiTransaction");
const Bets = require("../../models/bets");
const { generateAuthToken } = require("../../services/auth");
const Setting = require("../../models/settings");
const adminBankDetails = require("../../models/adminBankAccount");
const User = require("../../models/users");
const Agent = require("../../models/agent");

// Admin registration
const createAdmin = async (req, res) => {
  try {
    const { name, email, password, confirmPassword, mobileNumber } = req.body;

    // Validate fields
    if (!name || !email || !password || !confirmPassword || !mobileNumber) {
      return res.status(400).json({ error: "All fields are required." });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match." });
    }

    // Check if the email or mobile number already exists
    const existingAdmin = await Admin.findOne({
      $or: [{ email }, { mobileNumber }],
    });

    if (existingAdmin) {
      return res.status(400).json({
        error: "Admin with this email or mobile number already exists.",
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin
    const admin = new Admin({
      name,
      email,
      password: hashedPassword,
      mobileNumber,
    });

    await admin.save();

    return res.status(201).json({ message: "Admin created successfully." });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Server error. Please try again later." });
  }
};

// Admin login and JWT token generation
const loginAdmin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    let user;
    let isAdmin = false;

    if (email === "mobasirshaikh7204@gmail.com") {
      user = await Admin.findOne({ email });
      isAdmin = true;
    } else {
      user = await Agent.findOne({ email });
    }

    if (!user) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    // Restrict login if agent is Inactive
    if (!isAdmin && user.status !== "Active") {
      return res.status(403).json({ error: "Your account is inactive. Please contact admin." });
    }

    // ✅ Password check
    let isMatch;
    if (isAdmin) {
      // Admin password might still be hashed
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      // Plain text comparison for agent
      isMatch = password === user.password;
    }

    if (!isMatch) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    const token = generateAuthToken(user, isAdmin);

    // Agent extra info
    let extraInfo = {};
    if (!isAdmin) {
      const agentId = user.agent_id;

      const totalUsers = await User.countDocuments({ agentId });

      const balanceAgg = await User.aggregate([
        { $match: { agentId } },
        {
          $group: {
            _id: null,
            totalAvailableBalance: { $sum: "$availableBalance" },
            totalBalance: { $sum: "$balance" },
          },
        },
      ]);

      const totals = balanceAgg.length > 0 ? balanceAgg[0] : { totalAvailableBalance: 0, totalBalance: 0 };

      extraInfo = {
        totalUsers,
        totalAvailableBalance: totals.totalAvailableBalance,
        totalBalance: totals.totalBalance,
      };
    }

    return res.json({
      message: "Login successful.",
      role: isAdmin ? "admin" : "agent",
      token,
      ...(isAdmin
        ? {
          email: user.email,
          mobile: user.mobileNumber,
        }
        : {
          agent: {
            ...user.toObject(),
            password: undefined,
            ...extraInfo,
          },
        }),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error. Please try again later." });
  }
};



/**
 * Retrieves the total approved deposit and withdrawal amounts across all users.
 *
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
const getTotalApprovedAmounts = async (req, res) => {
  try {
    // Aggregate total approved deposits
    const totalDepositsResult = await deposite.aggregate([
      {
        $match: { status: "approved" }, // Only consider approved deposits
      },
      {
        $group: {
          _id: null,
          totalApprovedDeposits: { $sum: "$amount" },
        },
      },
    ]);

    // Aggregate total approved withdrawals
    const totalWithdrawalsResult = await Withdraw.aggregate([
      {
        $match: { status: "approved" }, // Only consider approved withdrawals
      },
      {
        $group: {
          _id: null,
          totalApprovedWithdrawals: { $sum: "$amount" },
        },
      },
    ]);

    // Extract the totals or default to 0 if no records found
    const totalApprovedDeposits =
      totalDepositsResult[0]?.totalApprovedDeposits || 0;
    const totalApprovedWithdrawals =
      totalWithdrawalsResult[0]?.totalApprovedWithdrawals || 0;

    return res.status(200).json({
      status: true,
      message:
        "Total approved deposit and withdrawal amounts retrieved successfully.",
      data: {
        totalApprovedDeposits,
        totalApprovedWithdrawals,
      },
    });
  } catch (error) {
    console.error("Error in getTotalApprovedAmounts:", error);
    return InternalServerError(res, error);
  }
};

/**
 * Allows an admin to manually draw the result by selecting a winning card.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
const manualDrawResult = async (req, res) => {
  try {
    const { winningCard } = req.body;

    if (!winningCard) {
      return res.status(400).json({
        status: false,
        message: "Winning card is required.",
      });
    }

    // Validate the winning card
    const possibleCards = [
      "UMBRELLA",
      "FOOTBALL",
      "SUN",
      "OIL_LAMP",
      "COW",
      "BUCKET",
      "KITE",
      "SPINNER",
      "ROSE",
      "BUTTERFLY",
      "HOPE",
      "RABBIT",
    ];

    if (!possibleCards.includes(winningCard)) {
      return res.status(400).json({
        status: false,
        message: "Invalid winning card selected.",
      });
    }

    // Access the session manager from the app
    const sessionManager = req.app.get("sessionManager");

    if (sessionManager.mode !== "manual") {
      return res.status(400).json({
        status: false,
        message: "Manual drawing is not enabled.",
      });
    }

    if (!sessionManager.isActive()) {
      return res.status(400).json({
        status: false,
        message: "No active session to draw the result.",
      });
    }

    // Manually draw the result
    await sessionManager.manualDrawResult(winningCard);

    return res.status(200).json({
      status: true,
      message: `Session ended with the winning card: ${winningCard}.`,
    });
  } catch (error) {
    console.error("Error in manualDrawResult:", error);
    return res
      .status(500)
      .json({ status: false, message: "Internal server error." });
  }
};

/**
 * Allows an admin to set the session mode to 'automatic' or 'manual'.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
const setSessionMode = async (req, res) => {
  try {
    const { mode } = req.body;

    // Validate mode
    if (!mode || !["automatic", "manual"].includes(mode)) {
      return res.status(400).json({
        status: false,
        message: "Invalid mode. Choose 'automatic' or 'manual'.",
      });
    }

    // Access the session manager from the app
    const sessionManager = req.app.get("sessionManager");
    if (!sessionManager) {
      return res.status(500).json({
        status: false,
        message: "Session manager is not initialized.",
      });
    }

    // Dynamically update the mode in the session manager
    await sessionManager.setMode(mode);

    // Persist the mode change in the database
    await sessionManager.updateModeInDB(mode);

    return res.status(200).json({
      status: true,
      message: `Session mode set to ${mode} successfully.`,
    });
  } catch (error) {
    console.error("Error in setSessionMode:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error.",
    });
  }
};

const getSettings = async (req, res) => {
  try {
    const settings = await Setting.find({}); // Fetch all settings

    if (!settings || settings.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No settings found.",
      });
    }

    const formattedSettings = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});

    return res.status(200).json({
      status: true,
      message: "Settings fetched successfully.",
      data: formattedSettings,
    });
  } catch (error) {
    console.error("Error in getSettings:", error);
    return res
      .status(500)
      .json({ status: false, message: "Internal server error." });
  }
};

const addBankAccount = async (req, res) => {
  try {
    const { accountName, accountNumber, bankName, ifscCode, upiId } = req.body;

    // Validate input
    if (!accountName || !accountNumber || !bankName || !ifscCode || !upiId) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // Check if the account already exists by account number or UPI ID
    const existingAccount = await adminBankDetails.findOne({
      $or: [{ accountNumber }, { upiId }],
    });

    if (existingAccount) {
      return res.status(400).json({
        message: "This bank account is already registered with the same account number or UPI ID.",
      });
    }

    // Create a new bank account entry
    const newBankAccount = new adminBankDetails({
      accountName,
      accountNumber,
      bankName,
      ifscCode,
      upiId,
      isActive: false, // Assuming you have a field to distinguish admin accounts
    });

    // Save to the database
    await newBankAccount.save();

    res.status(201).json({
      message: "Bank account added successfully.",
      data: newBankAccount, // Return the newly added bank account
    });
  } catch (error) {
    console.error("Error adding bank account:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

const editBankAccount = async (req, res) => {
  try {
    const { accountId, accountName, accountNumber, bankName, ifscCode, upiId } = req.body;

    // Validate input
    if (!accountName || !accountNumber || !bankName || !ifscCode || !upiId) {
      return res.status(400).json({
        success: false,
        message: "All fields are required.",
      });
    }

    // Check if the bank account exists
    const bankAccount = await adminBankDetails.findById(accountId);
    if (!bankAccount) {
      return res.status(404).json({
        success: false,
        message: "Bank account not found",
      });
    }

    // Update the bank account details
    bankAccount.accountName = accountName;
    bankAccount.accountNumber = accountNumber;
    bankAccount.bankName = bankName;
    bankAccount.ifscCode = ifscCode;
    bankAccount.upiId = upiId;

    // Save the updated bank account
    await bankAccount.save();

    res.status(200).json({
      success: true,
      message: "Bank account details updated successfully",
      data: bankAccount,  // Returning the updated bank account
    });
  } catch (error) {
    console.error("Error updating bank account:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const setActiveBankAccount = async (req, res) => {
  try {
    const { accountId, isActive } = req.body;

    // Validate input
    if (!accountId || typeof isActive === 'undefined') {
      return res.status(400).json({
        success: false,
        message: "Account ID and status are required",
      });
    }

    // Check if the account exists
    const accountExists = await adminBankDetails.findById(accountId);
    if (!accountExists) {
      return res.status(404).json({
        success: false,
        message: "Bank account not found",
      });
    }

    // If the status is true, deactivate all other accounts before activating the selected one
    if (isActive) {
      // Deactivate all other accounts first
      await adminBankDetails.updateMany({}, { isActive: false });

      // Now, set the selected account as active
      const updatedAccount = await adminBankDetails.findByIdAndUpdate(
        accountId,
        { isActive: true },
        { new: true }
      );

      if (!updatedAccount) {
        return res.status(500).json({
          success: false,
          message: "Failed to update the active bank account",
        });
      }

      res.status(200).json({
        success: true,
        message: "Bank account set as primary successfully",
        data: updatedAccount,
      });
    } else {
      // If the status is false, just deactivate the account
      const updatedAccount = await adminBankDetails.findByIdAndUpdate(
        accountId,
        { isActive: false },
        { new: true }
      );

      if (!updatedAccount) {
        return res.status(404).json({
          success: false,
          message: "Bank account not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Bank account deactivated successfully",
        data: updatedAccount,
      });
    }
  } catch (error) {
    console.error("Error setting active bank account:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getFundBankAccount = async (req, res) => {
  try {
    const activeAccount = await adminBankDetails.findOne({ isActive: true });

    if (!activeAccount) {
      return res.status(404).json({
        success: false,
        message: "No active bank account found",
      });
    }

    const { upiId, accountName, _id } = activeAccount;

    res.status(200).json({
      success: true,
      message: "Active bank account retrieved successfully",
      data: { upiId, accountName, _id },
    });
  } catch (error) {
    console.error("Error getting active bank account:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getAllBankAccounts = async (req, res) => {
  try {
    const bankPaymentsSummary = await adminBankDetails.aggregate([
      {
        $lookup: {
          from: "payments", // Replace with the actual name of your payments collection
          localField: "_id", // Field in the adminBankDetails collection
          foreignField: "bankId", // Field in the payments collection
          as: "payments", // Name of the output array field
        },
      },
      {
        $project: {
          _id: 1,
          accountNumber: 1,
          bankName: 1,
          accountName: 1,
          ifscCode: 1,
          upiId: 1,
          isActive: 1,
          totalDepositeAdded: 1,
          totalPayments: {
            $size: {
              $filter: {
                input: "$payments",
                as: "payment",
                cond: { $eq: ["$$payment.status", "approved"] }, // Only approved payments
              },
            },
          }, // Count of approved payments
          totalAmount: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$payments",
                    as: "payment",
                    cond: { $eq: ["$$payment.status", "approved"] }, // Only approved payments
                  },
                },
                as: "filteredPayment",
                in: "$$filteredPayment.amount", // Sum amounts of approved payments
              },
            },
          }, // Sum of approved payments amounts
        },
      },
    ]);

    if (!bankPaymentsSummary || bankPaymentsSummary.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No bank accounts with payments found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Bank payments summary retrieved successfully",
      data: bankPaymentsSummary,
    });
  } catch (error) {
    console.error("Error fetching bank payments summary:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    const skip = (page - 1) * limit;

    const searchQuery = search
      ? {
        $or: [
          { referredBy: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ],
      }
      : {};

    // Fetch users, total users count, deposit data, and withdrawal data
    const [users, totalUsers, depositData, withdrawalData] = await Promise.all([
      User
        .find(searchQuery)
        .skip(skip)
        .limit(limit)
        .select('phone availableBalance bonusAmount lastLoginTime referredBy referralCode _id') // Ensure referralCode is included
        .exec(),
      User.countDocuments(searchQuery).exec(),
      upideposites.aggregate([
        { $match: { status: "success" } },
        {
          $group: {
            _id: "$userId",
            totalDeposite: { $sum: "$amount" }
          }
        }
      ]),
      Withdraw.aggregate([
        { $match: { status: "approved" } },
        {
          $group: {
            _id: "$userId",
            totalWithdrawal: { $sum: "$amount" }
          }
        }
      ]),
    ]);

    // Convert deposit and withdrawal data into maps for quick lookup
    const depositMap = depositData.reduce((acc, dep) => {
      acc[dep._id.toString()] = dep.totalDeposite || 0;
      return acc;
    }, {});

    const withdrawalMap = withdrawalData.reduce((acc, wit) => {
      acc[wit._id.toString()] = wit.totalWithdrawal || 0;
      return acc;
    }, {});

    // Append totalDeposite & totalWithdrawal to each user
    const updatedUsers = users.map(user => ({
      ...user.toObject(),
      totalDeposite: depositMap[user._id.toString()] || 0,
      totalWithdrawal: withdrawalMap[user._id.toString()] || 0,
    }));

    res.status(200).json({
      success: true,
      data: updatedUsers,
      pagination: {
        currentPage: parseInt(page, 10),
        totalPages: Math.ceil(totalUsers / limit),
        totalUsers,
        limit: parseInt(limit, 10),
      },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
};


const updateUserInfo = async (req, res) => {
  try {
    const { userId } = req.params; // Extract user ID from URL params


    // Disallow updates to bonusAmount and availableBalance
    // return res.status(403).json({
    //   success: false,
    //   message: 'Updating bonusAmount and availableBalance is currently not allowed.',
    // });


    const { bonusAmount, availableBalance } = req.body; // Extract fields from request body

    // Validate input
    if (typeof bonusAmount !== 'number' || typeof availableBalance !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'Invalid input. Fields should be numbers.',
      });
    }

    // Calculate the new balance
    const balance = availableBalance + bonusAmount;

    // Update the user document, including balance field
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        bonusAmount,
        availableBalance,
        balance  // Add balance field as sum of availableBalance and bonusAmount
      },
      { new: true } // Return the updated document
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'User info updated successfully.',
      data: updatedUser,
    });
  } catch (error) {
    console.error('Error updating user info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user info.',
    });
  }
};

const getUserBets = async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    // Fetch all bets for the given user ID
    const userBets = await Bets.find({ userId }).lean(); // .lean() improves performance

    if (!userBets || userBets.length === 0) {
      return res.status(404).json({ message: "No bets found for this user." });
    }

    res.status(200).json({ success: true, bets: userBets });
  } catch (error) {
    console.error("Error fetching user bets:", error);
    res.status(500).json({ success: false, message: "Internal server error. Please try again later." });
  }
};


module.exports = {
  createAdmin,
  loginAdmin,
  getTotalApprovedAmounts,
  manualDrawResult,
  setSessionMode,
  getSettings,
  addBankAccount,
  editBankAccount,
  setActiveBankAccount,
  getFundBankAccount,
  getAllBankAccounts,
  getAllUsers,
  updateUserInfo,
  getUserBets
};
