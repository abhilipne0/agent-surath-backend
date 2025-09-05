const mongoose = require("mongoose");

const accountStatementSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: { 
    type: String, 
    enum: ["bet", "win", "loss", "deposit", "withdraw_request", "withdraw_approve", "refund", 'referral_bonus', 'bonus', 'withdraw_reject'],
    required: true
  },
  gameId: { type: String, default: null },
  card: { type: String, default: null },
  amount: { type: Number, required: true },
  walletBefore: { type: Number, required: true },
  walletAfter: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ["pending", "success", "rejected"], 
    default: "success" 
  },
  description: { type: String },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("AccountStatement", accountStatementSchema);