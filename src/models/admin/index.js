const mongoose = require("mongoose");

const adminSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    mobileNumber: {
      type: String,
      required: true,
      unique: true,
    },
    role: {
      type: String,
      default: "admin",
    },
    tokens: [
      {
        token: {
          type: String,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

const Admin = mongoose.model("Admin", adminSchema);

module.exports = Admin;
