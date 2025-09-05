const mongoose = require("mongoose");

const adminBankAccountSchema = new mongoose.Schema({
  accountName: {
    type: String,
    required: true,
    trim: true,
  },
  accountNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  bankName: {
    type: String,
    required: true,
    trim: true,
  },
  ifscCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  upiId: {
    type: String,
    required: true,
    trim: true,
  },
  totalDepositeAdded: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("AdminBankAccount", adminBankAccountSchema);
