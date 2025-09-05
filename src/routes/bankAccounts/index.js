const express = require("express");
const {
  addBankAccount,
  getUserBankAccounts,
  deleteBankAccount,
} = require("../../controllers/bankAccounts");
const auth = require("../../middlewares/auth");
const { getFundBankAccount } = require("../../controllers/admin");

const router = express.Router();

// Add bank acount for use
router.post("/add/bank/account", auth, addBankAccount);

// Get bank account for user
router.get("/bank/accounts", auth, getUserBankAccounts);

// Delete a bank account
router.delete("/bank/account/:bankAccountId", auth, deleteBankAccount);

// get bank account for deposite money
router.get("/active/bank/account", auth, getFundBankAccount);

module.exports = router;
