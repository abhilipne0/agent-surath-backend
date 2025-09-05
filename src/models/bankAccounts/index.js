const mongoose = require("mongoose");

const bankAccountSchema = new mongoose.Schema({
  accountHolderName: {
    type: String,
    required: true,
  },
  accountNumber: {
    type: String,
    required: true,
    unique: true, // Ensure account number is unique to avoid duplicates
  },
  ifscCode: {
    type: String,
    required: true,
  },
  bankName: {
    type: String,
  },
  upiId: {
    type: String,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  isDeleted: {
    type: Boolean,
    default: false, // Soft delete field
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const BankAccount = mongoose.model("BankAccount", bankAccountSchema);

module.exports = BankAccount;
