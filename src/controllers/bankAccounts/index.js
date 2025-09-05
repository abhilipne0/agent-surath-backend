const BankAccount = require("../../models/bankAccounts");
const { InternalServerError } = require("../../utils/errorHandler");
const User = require("../../models/users");

/**
 * Adds a new bank account for the authenticated user.
 */
const addBankAccount = async (req, res) => {
  try {
    const userId = req.userId;
    const { accountHolderName, accountNumber, ifscCode, bankName, upiId } = req.body;

    // Validate inputs
    if (!accountHolderName || !accountNumber || !ifscCode || !bankName) {
      return res.status(400).json({
        status: false,
        message:
          "All fields (accountHolderName, accountNumber, ifscCode, bankName, upiId) are required.",
      });
    }

    // Check if the account already exists
    const existingAccount = await BankAccount.findOne({ accountNumber, userId });

    if (existingAccount) {
      if (existingAccount.isDeleted) {
        // Just reactivate the deleted account — DO NOT update other details
        existingAccount.isDeleted = false;
        await existingAccount.save();

        return res.status(200).json({
          status: true,
          message: "Bank account reactivated successfully.",
          data: {
            bankAccount: existingAccount,
          },
        });
      } else {
        return res.status(400).json({
          status: false,
          message: "Account number already exists.",
        });
      }
    }

    // Create a new bank account
    const newBankAccount = new BankAccount({
      accountHolderName,
      accountNumber,
      ifscCode,
      bankName,
      upiId,
      userId,
    });

    const savedBankAccount = await newBankAccount.save();

    // Associate the bank account with the user
    const user = await User.findById(userId);
    if (!user) {
      await BankAccount.findByIdAndDelete(savedBankAccount._id);
      return res.status(404).json({
        status: false,
        message: "User not found.",
      });
    }

    user.bankAccounts.push(savedBankAccount._id);
    await user.save();

    return res.status(201).json({
      status: true,
      message: "Bank account added successfully.",
      data: {
        bankAccount: savedBankAccount,
      },
    });
  } catch (error) {
    console.error("Error in addBankAccount:", error);
    return InternalServerError(res, error);
  }
};


/**
 * Retrieves the authenticated user's bank accounts.
 * Supports pagination through query parameters.
 */
const getUserBankAccounts = async (req, res) => {
  try {
    const userId = req.userId;

    // Extract pagination parameters from query, set defaults if not provided
    const { page = 1, limit = 10 } = req.query;

    // Calculate the number of documents to skip
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch the user and populate bankAccounts (excluding deleted ones)
    const user = await User.findById(userId)
      .populate({
        path: "bankAccounts",
        match: { isDeleted: false }, // Exclude deleted accounts
        options: {
          sort: { createdAt: -1 }, // Sort by most recent
          skip: skip,
          limit: parseInt(limit),
        },
      })
      .lean();

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found.",
      });
    }

    // Get total number of active bank accounts
    const totalBankAccounts = await BankAccount.countDocuments({
      userId,
      isDeleted: false,
    });

    const totalPages = Math.ceil(totalBankAccounts / parseInt(limit));

    res.status(200).json({
      status: true,
      message: "Bank accounts fetched successfully.",
      data: user.bankAccounts,
      pagination: {
        totalBankAccounts,
        currentPage: parseInt(page),
        totalPages,
        pageSize: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error in getUserBankAccounts:", error);
    return InternalServerError(res, error);
  }
};

const deleteBankAccount = async (req, res) => {
  try {
    const userId = req.userId;
    const { bankAccountId } = req.params;

    // Find the bank account to ensure it belongs to the user
    const bankAccount = await BankAccount.findOne({
      _id: bankAccountId,
      userId,
      isDeleted: false,
    });

    if (!bankAccount) {
      return res.status(404).json({
        status: false,
        message: "Bank account not found or already deleted.",
      });
    }

    // Perform soft delete
    bankAccount.isDeleted = true;
    await bankAccount.save();

    return res.status(200).json({
      status: true,
      message: "Bank account deleted successfully.",
    });
  } catch (error) {
    console.error("Error in deleteBankAccount:", error);
    return InternalServerError(res, error);
  }
};

const getBankAccountById = async (req, res) => {
  const { id } = req.params;

  try {
    const bankAccount = await BankAccount.findById(id);

    if (!bankAccount) {
      return res.status(404).json({ message: "Bank account not found" });
    }

    res.status(200).json(bankAccount);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

module.exports = {
  addBankAccount,
  getUserBankAccounts,
  deleteBankAccount,
  getBankAccountById,
};
