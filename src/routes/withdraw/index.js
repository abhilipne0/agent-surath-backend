const express = require("express");
const {
  createWithdrawRequest,
  getUserWithdrawHistory,
  getAllWithdrawRequests,
  approveWithdrawRequest,
  rejectWithdrawRequest,
  getWithdrawTotalByDate,
} = require("../../controllers/withdraw");
const auth = require("../../middlewares/auth");
const allowOnlyAdmins = require("../../middlewares/allowedUsers");

const router = express.Router();

// Route to create a withdraw request
router.post("/request", auth, createWithdrawRequest);

// Route to get withdraw history
router.get("/history", auth, getUserWithdrawHistory);




// Admin Routes

// Route to get withdraw total amount
router.get( "/total/:date", allowOnlyAdmins, getWithdrawTotalByDate);

// Route to get all withdraw requests
router.get( "/all-withdraw-requests", allowOnlyAdmins, getAllWithdrawRequests);

// Route to approve a withdraw request
router.patch("/approve-withdraw/:withdrawId", allowOnlyAdmins, approveWithdrawRequest
);

// Route to reject a withdraw request
router.patch("/reject-withdraw/:withdrawId", allowOnlyAdmins, rejectWithdrawRequest);

module.exports = router;
