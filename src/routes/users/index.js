const express = require("express");
const userRouter = express.Router();
const {
  newSignUp,
  verifyOTP,
  requestLoginOTP,
  resendLoginOTP,
  verifyLoginOTP,
  resendRegistrationOTP,
  getUserInfo,
  getUserBalance,
  register,
  verifyRegistrationOTP,
  resendregistrationOTP,
  loginUser,
  requestPasswordReset,
  resetPassword,
  getUserStatements,
  fcmToken,
} = require("../../controllers/user");
const auth = require("../../middlewares/auth");
const { otpResendLimiter } = require("../../middlewares/rateLimiter");

// Signup Route
// userRouter.post("/register", register);

// userRouter.post("/register/verify", verifyRegistrationOTP);

// userRouter.post("/register/resend", resendregistrationOTP);

userRouter.post("/login", loginUser);

// Route to request password reset
userRouter.post("/forgot/password", requestPasswordReset);

// Route to reset password
userRouter.post("/password/reset", resetPassword);

// New Route: Get User Information
userRouter.get("/information", auth, getUserInfo);

// New Route: Get User Information
userRouter.get("/balance", auth, getUserBalance);

// get user statement
userRouter.get("/statement", auth, getUserStatements);

userRouter.post("/fcm/register", fcmToken);

module.exports = userRouter;
