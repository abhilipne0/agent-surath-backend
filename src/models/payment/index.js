const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0, "Amount must be positive"],
    },
    utrNumber: {
      type: String,
      required: true,
      unique: true,
    },
    paymentScreenshotUrl: {
      type: String,
      required: true,
    },
    bankId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminBankAccount",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model("MDeposite", paymentSchema);

module.exports = Payment;
