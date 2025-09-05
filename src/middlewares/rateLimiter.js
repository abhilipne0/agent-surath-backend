const rateLimit = require("express-rate-limit");

// Limit to 5 OTP verification attempts per hour
const otpVerifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message:
    "Too many OTP verification attempts from this IP, please try again after an hour.",
});

// Limit to 3 OTP resend requests per hour
const otpResendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message:
    "Too many OTP resend requests from this IP, please try again after an hour.",
});

module.exports = { otpVerifyLimiter, otpResendLimiter };
