const mongoose = require("mongoose");

const withdrawSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BankAccount",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0, "Amount must be positive"],
    },
    reason: {
      type: String,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

const Withdraw = mongoose.model("Withdraw", withdrawSchema);

module.exports = Withdraw;
