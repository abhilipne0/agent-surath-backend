const mongoose = require("mongoose");

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
    },
    phone: {
      type: String,
      required: true,
    },
    password: {
      type: String,
    },
    balance: {
      type: Number,
      default: 0,
    },
    availableBalance: {
      type: Number,
      default: 0,
    },
    bonusAmount: {
      type: Number,
      default: 0,
    },
    status: {
      type: Boolean,
      default: true,
    },
    createdDate: { type: String },
    lastLoginTime: {
      type: Date,
      default: null,
    },
    tokens: [
      {
        _id: false,
        token: {
          type: String,
          default: null,
        },
      },
    ],
    token: {
      type: String,
    },
    token_expiry_time: {
      type: Date,
    },
    role: {
      type: String,
      default: "user",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isRegistered: {
      type: Boolean,
      default: false,
    },
    referralCode: {
      type: String,
      unique: true,
    },
    referredBy: {
      type: String,
      default: null,
    },
    bankAccounts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "BankAccount",
      },
    ],
    otp: {
      type: String,
    },
    otpExpiry: {
      type: Date,
    },
    agentId: {
      type: String,
      default: null,
    },
    createdBy: {
      type: String,
      enum: ["self", "agent"],
      default: "self",
    },
  },
  {
    timestamps: true,
  }
);

// Automatically round balances before saving
userSchema.pre("save", function (next) {
  if (this.isModified("balance") && typeof this.balance === "number") {
    this.balance = Math.round((this.balance + Number.EPSILON) * 100) / 100;
  }

  if (this.isModified("availableBalance") && typeof this.availableBalance === "number") {
    this.availableBalance = Math.round((this.availableBalance + Number.EPSILON) * 100) / 100;
  }

  if (this.isModified("bonusAmount") && typeof this.bonusAmount === "number") {
    this.bonusAmount = Math.round((this.bonusAmount + Number.EPSILON) * 100) / 100;
  }

  next();
});

// Round balances when converting to JSON (API output)
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.balance = Math.round((obj.balance + Number.EPSILON) * 100) / 100;
  obj.availableBalance = Math.round((obj.availableBalance + Number.EPSILON) * 100) / 100;
  obj.bonusAmount = Math.round((obj.bonusAmount + Number.EPSILON) * 100) / 100;
  return obj;
};

// Deduct balance method
userSchema.methods.deductBalance = async function (amount) {
  if (amount <= 0) {
    throw new Error("Amount to deduct should be greater than zero.");
  }

  let bonusDeduction = 0;
  let mainBalanceDeduction = 0;

  if (this.availableBalance === 0 && this.bonusAmount >= amount) {
    bonusDeduction = amount;
  } else if (this.bonusAmount > 0) {
    let maxBonusDeduction = amount * 0.2;
    bonusDeduction = Math.min(this.bonusAmount, maxBonusDeduction);
  }

  mainBalanceDeduction = amount - bonusDeduction;

  if (this.availableBalance < mainBalanceDeduction) {
    let remainingFromBonus = mainBalanceDeduction - this.availableBalance;
    if (this.bonusAmount >= remainingFromBonus) {
      bonusDeduction += remainingFromBonus;
      mainBalanceDeduction = this.availableBalance;
    } else {
      throw new Error("Insufficient balance to deduct the amount.");
    }
  }

  this.bonusAmount -= bonusDeduction;
  this.availableBalance -= mainBalanceDeduction;
  this.balance = this.availableBalance + this.bonusAmount;

  await this.save();
  return true;
};

// Add winnings
userSchema.methods.addWinnings = async function (amountWon) {
  if (amountWon <= 0) {
    throw new Error("Amount won should be greater than zero.");
  }

  this.availableBalance = Math.round((this.availableBalance + amountWon + Number.EPSILON) * 100) / 100;
  this.balance = Math.round((this.availableBalance + this.bonusAmount + Number.EPSILON) * 100) / 100;

  await this.save();
};

// Add balance (e.g., deposit)
userSchema.methods.addBalance = async function (amount, options = {}) {
  if (amount <= 0) {
    throw new Error("Amount to add should be greater than zero.");
  }

  this.availableBalance += amount;
  this.balance = this.availableBalance + this.bonusAmount;

  await this.save(options);
  return true;
};

const user = mongoose.model("user", userSchema);
module.exports = user;
