const express = require("express");
const { initiatePayment, handleUpiWebhook, getUpiDepositHistory, getAllUpiDepositeHistory, checUpiPaymentStatus, updateTransactionStatus } = require("../../controllers/upiTransaction");
const auth = require("../../middlewares/auth");
const abhiAdminAuth = require("../../middlewares/abhiAdmin");
const transactionRouter = express.Router();

// Middleware for webhook to parse form-urlencoded body
transactionRouter.use(express.urlencoded({ extended: true }));

transactionRouter.post('/payment/order', auth, initiatePayment);
transactionRouter.post('/webhook', handleUpiWebhook);
transactionRouter.post('/payment/history', auth, getUpiDepositHistory);

// Admin API
transactionRouter.get('/all-deposit-requests', abhiAdminAuth, getAllUpiDepositeHistory);
transactionRouter.post("/check-status", abhiAdminAuth, checUpiPaymentStatus);
transactionRouter.patch('/update-transaction-status/:id', abhiAdminAuth,  updateTransactionStatus);

module.exports = transactionRouter;
