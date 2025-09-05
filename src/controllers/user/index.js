const user = require("../../models/users");
const bcrypt = require("bcryptjs");
const { generateOTP, sendOTPSMS } = require("../../services/twilio");
const { InternalServerError } = require("../../utils/errorHandler");
const { generateAuthToken } = require("../../services/auth");
const crypto = require('crypto');
const AccountStatement = require("../../models/AccountStatement");
const FcmToken = require('../../models/fcmToken')
const logStatement = require("../../utils/logStatement");
const moment = require('moment-timezone');

/**
 * Creates a new user with optional email and password.
 * Primary login method is via phone and OTP.
 */
const generateReferralCode = (phone) => {
  const phoneString = phone.toString();  // Ensure phone is a string
  const hash = crypto.createHash('md5').update(phoneString).digest('hex');
  return `REF${hash.slice(0, 8).toUpperCase()}`;
};

const register = async (req, res) => {
  try {
    const { phone, password, referralCode } = req.body;

    // Validate input
    if (!phone || !password) {
      return res.status(400).json({
        status: false,
        message: "Phone number and password are required.",
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        status: false,
        message: "Password must be at least 6 characters.",
      });
    }

    // Check if user exists
    let existingUser = await user.findOne({ phone: phone });

    // Case 1: User exists but is not verified
    if (existingUser) {
      if (!existingUser.isVerified) {
        // Generate new OTP and update user
        const otp = generateOTP();
        existingUser.otp = otp;
        existingUser.otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes from now
        await existingUser.save();

        // Send OTP
        await sendOTPSMS(phone, otp);

        return res.status(200).json({
          status: true,
          message: "User already exists but is not verified. OTP resent successfully.",
        });
      }

      // Case 2: User exists and is verified
      return res.status(400).json({
        status: false,
        message: "User is already registered. Please log in.",
      });
    }

    // Case 3: User does not exist, create a new user
    const otp = generateOTP();
    const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes from now
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate a referral code for the new user
    const referralCodeGenerated = generateReferralCode(phone);

    // Check if the referral code exists and associate the referredBy field
    let referredBy = null;
    if (referralCode) {
      const referrer = await user.findOne({ referralCode });
      if (referrer) {
        referredBy = referrer.referralCode;
      }
    }

    const newUser = new user({
      phone: phone,
      password: hashedPassword,
      otp,
      otpExpiry,
      isVerified: false,
      referralCode: referralCodeGenerated,
      referredBy: referredBy,
    });

    await newUser.save();

    // Send OTP
    await sendOTPSMS(phone, otp);

    return res.status(201).json({
      status: true,
      message: "User registered successfully. OTP sent.",
    });
  } catch (error) {
    console.error("Error in register:", error);
    return InternalServerError(res, error);
  }
};

const verifyRegistrationOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    // ✅ Validate input
    if (!phone || !otp) {
      return res
        .status(400)
        .json({ status: false, message: "Phone number and OTP are required." });
    }

    // ✅ Find the user by phone number
    const existingUser = await user.findOne({ phone: phone });
    if (!existingUser) {
      return res.status(400).json({ status: false, message: "User not found." });
    }

    // ✅ Prevent already verified users from verifying again
    if (existingUser.isVerified) {
      return res
        .status(400)
        .json({ status: false, message: "User is already verified." });
    }

    // ✅ Check if OTP is valid and not expired
    if (!existingUser.otp || existingUser.otpExpiry < Date.now()) {
      return res.status(400).json({
        status: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    // ✅ Validate OTP
    if (existingUser.otp !== otp) {
      return res.status(400).json({ status: false, message: "Invalid OTP." });
    }

    // ----------------------------
    // 🎉 OTP is valid → verify user
    // ----------------------------
    existingUser.isVerified = true;
    existingUser.otp = undefined;
    existingUser.otpExpiry = undefined;

    // ✅ Give registration bonus
    const bonusAmount = 30; // changed from 30 → 50
    const walletBefore = existingUser.balance || 0;

    existingUser.bonusAmount = (existingUser.bonusAmount || 0) + bonusAmount;
    existingUser.balance = walletBefore + bonusAmount;

    const walletAfter = existingUser.balance;

    await logStatement({
      userId: existingUser._id,
      type: "bonus",
      amount: bonusAmount,
      walletBefore,
      walletAfter,
      description: `₹${bonusAmount} bonus credited on registration verification.`,
    });

    // ✅ Handle referral bonus if applicable
    if (existingUser.referredBy) {
      const referrer = await user.findOne({
        referralCode: existingUser.referredBy,
      });

      if (referrer) {
        // ✅ Count how many verified users this referrer has
        const referredUsersCount = await user.countDocuments({
          referredBy: referrer.referralCode,
          isVerified: true,
        });

        // ✅ Max 10 referrals
        if (referredUsersCount <= 1) {
          const refBonus = 30; // changed from 20 → 30
          const refWalletBefore = referrer.balance || 0;

          referrer.bonusAmount = (referrer.bonusAmount || 0) + refBonus;
          referrer.balance = refWalletBefore + refBonus;

          const refWalletAfter = referrer.balance;

          await referrer.save();

          await logStatement({
            userId: referrer._id,
            type: "referral_bonus",
            amount: refBonus,
            walletBefore: refWalletBefore,
            walletAfter: refWalletAfter,
            description: `Referral bonus of ₹${refBonus} credited for referring a verified user.`,
          });
        }
      }
    }

    // ✅ Save verified user
    await existingUser.save();

    // ✅ Generate JWT token for login
    const token = generateAuthToken(existingUser);

    return res.status(200).json({
      status: true,
      message: "Registration successful. You are now logged in.",
      data: {
        _id: existingUser._id,
        phone: existingUser.phone,
        isVerified: existingUser.isVerified,
        agent: existingUser.createdBy,
        token,
      },
    });
  } catch (error) {
    console.error("Error in verifyRegistrationOTP:", error);
    return InternalServerError(res, error);
  }
};


// Resend OTP
const resendregistrationOTP = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res
        .status(400)
        .json({ status: false, message: "Phone number is required." });
    }

    // Check if user exists
    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found. Please register first.",
      });
    }

    // Check if the user is already verified
    if (user.isVerified) {
      return res.status(400).json({
        status: false,
        message: "User is already verified. Please log in.",
      });
    }

    // Generate a new OTP
    const otp = generateOTP();
    const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes from now

    // Update OTP and expiry in the user record
    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();

    // Send OTP via SMS
    await sendOTPSMS(phone, otp);

    return res.status(200).json({
      status: true,
      message: "OTP resent successfully. Please check your phone.",
    });
  } catch (error) {
    console.error("Error in resendOTP:", error);
    return res
      .status(500)
      .json({ status: false, message: "Internal server error." });
  }
};

const loginUser = async (req, res) => {
  try {
    const { phone, password } = req.body;

    // Validate input
    if (!phone || !password) {
      return res.status(400).json({
        status: false,
        message: "Phone number and password are required.",
      });
    }

    // Find the user by phone number
    const existingUser = await user.findOne({ phone: phone });

    if (!existingUser) {
      return res.status(400).json({
        status: false,
        message: "User not found. Please register first.",
      });
    }

    // Check if user is inactive
    if (!existingUser.status) {
      return res.status(403).json({
        status: false,
        message: "Your account is inactive. Please contact admin.",
      });
    }

    // Check if the user is verified
    if (!existingUser.isVerified) {
      return res.status(400).json({
        status: false,
        message: "User is not verified. Please complete OTP verification.",
      });
    }

    // Conditional password validation
    let isPasswordValid = false;

    if (existingUser.createdBy === "agent") {
      // Plain text comparison
      isPasswordValid = password === existingUser.password;
    } else {
      // Hashed password comparison
      isPasswordValid = await bcrypt.compare(password, existingUser.password);
    }

    if (!isPasswordValid) {
      return res.status(400).json({
        status: false,
        message: "Invalid password.",
      });
    }

    // Generate JWT token
    const token = generateAuthToken(existingUser); // Assume this function generates a token

    // Update last login time
    existingUser.lastLoginTime = new Date();
    await existingUser.save();

    // Send response
    return res.status(200).json({
      status: true,
      message: "Login successful.",
      data: {
        _id: existingUser._id,
        phone: existingUser.phone,
        balance: existingUser.balance,
        createdBy: existingUser.createdBy,
        token: token,
      },
    });
  } catch (error) {
    console.log("Error in loginUser:", error);
    return InternalServerError(res, error); // Standard error response
  }
};

/**
 * Retrieves the authenticated user's information.
 *
 * @param {Object} req - The Express request object containing userId from the auth middleware.
 * @param {Object} res - The Express response object used to send back the user information.
 */
const getUserInfo = async (req, res) => {
  try {
    const userId = req.userId;

    // Validate that userId exists
    if (!userId) {
      return res.status(400).json({
        status: false,
        message: "User ID is missing in the request.",
      });
    }

    // Fetch the user from the database, excluding sensitive fields
    const userInfo = await user.findById(userId).select("-password -tokens -otp -otpExpiry");

    if (!userInfo) {
      return res.status(404).json({
        status: false,
        message: "User not found.",
      });
    }

    // Prepare user data for response
    const userData = {
      _id: userInfo._id,
      firstName: userInfo.firstName,
      lastName: userInfo.lastName,
      phone: userInfo.phone,
      email: userInfo.email,
      balance: userInfo.balance,
      availableBalance: userInfo.availableBalance,
      bonusAmount: userInfo.bonusAmount,
      referralCode: userInfo.referralCode,
      status: userInfo.status,
      createdAt: userInfo.createdAt,
      updatedAt: userInfo.updatedAt,
      role: userInfo.role,
      isVerified: userInfo.isVerified,
      isRegistered: userInfo.isRegistered,
      bankAccounts: userInfo.bankAccounts,
    };

    return res.status(200).json({
      status: true,
      message: "User information retrieved successfully.",
      data: userData,
    });
  } catch (error) {
    console.error("Error in getUserInfo:", error);
    return InternalServerError(res, error);
  }
};

const getUserBalance = async (req, res) => {
  try {
    const userId = req.userId;

    // Validate that userId exists
    if (!userId) {
      return res.status(400).json({
        status: false,
        message: "User ID is missing in the request.",
      });
    }

    // Fetch only the balance-related fields from the user in the database
    const userData = await user
      .findById(userId)
      .select("balance availableBalance bonusAmount");

    if (!userData) {
      return res.status(404).json({
        status: false,
        message: "User not found.",
      });
    }

    // Prepare balance data for response
    const balanceData = {
      balance: userData.balance,
      availableBalance: userData.availableBalance,
      bonusAmount: userData.bonusAmount,
    };

    return res.status(200).json({
      status: true,
      message: "User balance information retrieved successfully.",
      data: balanceData,
    });
  } catch (error) {
    console.error("Error in getUserBalance:", error);
    return InternalServerError(res, error);
  }
};

const requestPasswordReset = async (req, res) => {
  try {
    const { phone } = req.body;

    // Validate input
    if (!phone) {
      return res.status(400).json({
        status: false,
        message: "Phone number is required.",
      });
    }

    // Find the user by phone number
    const existingUser = await user.findOne({ phone: phone });
    if (!existingUser) {
      return res.status(404).json({
        status: false,
        message: "User not found.",
      });
    }

    // Generate a new OTP and set expiry (10 minutes)
    const resetOTP = generateOTP();
    const resetOTPExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes from now

    // Update user with reset OTP details
    existingUser.otp = resetOTP;
    existingUser.otpExpiry = resetOTPExpiry;
    await existingUser.save();

    // Send OTP via SMS
    await sendOTPSMS(phone, resetOTP);

    return res.status(200).json({
      status: true,
      message: "Password reset OTP sent successfully. Please check your phone.",
    });
  } catch (error) {
    console.error("Error in requestPasswordReset:", error);
    return InternalServerError(res, error);
  }
};

/**
 * Handles password reset by verifying the reset OTP and updating the password.
 */
const resetPassword = async (req, res) => {
  try {
    const { phone, resetOTP, newPassword } = req.body;

    // Validate input
    if (!phone || !resetOTP || !newPassword) {
      return res.status(400).json({
        status: false,
        message: "Phone number, reset OTP, and new password are required.",
      });
    }

    // Validate password length
    if (newPassword.length < 6) {
      return res.status(400).json({
        status: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    // Find the user by phone number
    const existingUser = await user.findOne({ phone: phone });
    if (!existingUser) {
      return res.status(404).json({
        status: false,
        message: "User not found.",
      });
    }

    // Check if reset OTP is valid and not expired
    const otpExpiry = new Date(existingUser.otpExpiry);
    if (
      !existingUser.otp ||
      existingUser.otp !== resetOTP ||
      otpExpiry < Date.now()
    ) {
      return res.status(400).json({
        status: false,
        message: "Invalid or expired reset OTP.",
      });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the user's password and clear reset OTP fields
    existingUser.password = hashedPassword;
    existingUser.otp = undefined; // Clear OTP after successful verification
    existingUser.otpExpiry = undefined;
    await existingUser.save();

    return res.status(200).json({
      status: true,
      message: "Password has been reset successfully.",
    });
  } catch (error) {
    console.error("Error in resetPassword:", error);
    return InternalServerError(res, error);
  }
};

const getUserStatements = async (req, res) => {
  try {
    const userId = req.userId;
    const { type, page = 1, pageSize = 10 } = req.query;

    const limit = parseInt(pageSize);
    const skip = (parseInt(page) - 1) * limit;

    const query = { userId };
    if (type) {
      query.type = type;
    }

    const [statements, totalCount] = await Promise.all([
      AccountStatement.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit),
      AccountStatement.countDocuments(query)
    ]);

    const formattedStatements = statements.map((item) => {
      const baseData = {
        type: item.type,
        amount: item.amount,
        walletBefore: item.walletBefore,
        walletAfter: item.walletAfter,
        timestamp: moment(item.timestamp).tz("Asia/Kolkata").format("YYYY-MM-DD hh:mm A")
      };

      if (item.type === 'bet' || item.type === 'win') {
        baseData.gameId = item.gameId;
        baseData.card = item.card;
      }

      return baseData;
    });

    res.status(200).json({
      status: true,
      message: "User statements fetched successfully.",
      data: formattedStatements,
      totalCount: totalCount // ⚠️ name this 'total' to match frontend expectations
    });

  } catch (error) {
    console.error("Error in getUserStatements:", error);
    res.status(500).json({
      status: false,
      message: "Failed to fetch statements.",
    });
  }
};


const fcmToken = async (req, res) => {
  try {
    const { fcmToken, platform } = req.body;

    if (!fcmToken || !platform) {
      return res.status(400).json({ message: "Missing FCM token or platform" });
    }

    await FcmToken.findOneAndUpdate(
      { token: fcmToken },
      { platform, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    return res.status(200).send("Token saved successfully");
  } catch (error) {
    console.error("🔥 Error saving FCM token:", error);
    return res.status(500).json({ message: "Failed to save token" });
  }
};


module.exports = {
  register,
  fcmToken,
  verifyRegistrationOTP,
  resendregistrationOTP,
  loginUser,
  resetPassword,
  requestPasswordReset,
  getUserInfo,
  getUserBalance,
  getUserStatements
};
