const mongoose = require("mongoose");

const depositsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    orderId: {
      type: String,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: [0, "Amount must be positive"],
    },
    customer_mobile: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
    },
    reason: {
      type: String,
      default: null,
    },
    UTRNumber: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Deposits = mongoose.model("Deposits", depositsSchema);

module.exports = Deposits;
