const { createPaymentOrder } = require("../../utils/upiService/upiService");
const User = require('../../models/users');
const Payment = require("../../models/upiTransaction");
const logStatement = require('../../utils/logStatement');
const moment = require("moment-timezone");
const mongoose = require('mongoose');
const axios = require("axios");
const { InternalServerError } = require("../../utils/errorHandler");

exports.initiatePayment = async (req, res) => {
  try {
    const {
      clientTxnId,
      amount,
      productInfo,
      customerName,
      customerEmail,
      customerMobile
      // removed redirectUrl
    } = req.body;

    const userId = req.userId;

    if (!clientTxnId || !amount || !productInfo || !customerName || !customerEmail || !customerMobile) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    if (!userId) {
      return res.status(400).json({ success: false, message: "Missing User Id" });
    }

    if (parseFloat(amount) < 0) {
      return res.status(400).json({ success: false, message: "Minimum amount required is ₹100" });
    }

    // ✅ Secure backend-defined redirect URL
    const redirectUrl = "https://pappuplaying.online/deposit";

    const paymentData = {
      client_txn_id: clientTxnId,
      amount: amount.toString(),
      p_info: productInfo,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_mobile: customerMobile,
      redirect_url: redirectUrl,
      udf1: "udf1",
      udf2: "udf2",
      udf3: "udf3",
    };

    const apiRes = await createPaymentOrder(paymentData);
    console.log("Step 1 =>", userId);

    if (apiRes.status) {
      console.log("Step 2 =>", userId);

      await Payment.create({
        client_txn_id: clientTxnId,
        amount,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_mobile: customerMobile,
        p_info: productInfo,
        status: 'pending',
        userId: userId
      });

      console.log("apiRes.data =>", apiRes.data);

      const safeData = {
        payment_url: apiRes.data.payment_url,
        bhim_link: apiRes.data.upi_intent?.bhim_link || null,
        phonepe_link: apiRes.data.upi_intent?.phonepe_link || null,
        paytm_link: apiRes.data.upi_intent?.paytm_link || null,
        gpay_link: apiRes.data.upi_intent?.gpay_link || null,
        order_id: apiRes.data.order_id,
        client_txn_id: clientTxnId,
        session_id: apiRes.data.session_id
      };

      return res.json({ success: true, data: safeData });
    } else {
      return res.status(400).json({ success: false, message: apiRes.msg });
    }
  } catch (err) {
    console.error("Payment creation error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Webhook controller
exports.handleUpiWebhook = async (req, res) => {
  console.log("🔔 Webhook Received");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      client_txn_id,
      status,
      remark,
      upi_txn_id,
      txnAt,
    } = req.body;

    // Basic validation
    if (!client_txn_id || !status) {
      console.warn("⚠️ Missing required fields in webhook");
      return res.sendStatus(400);
    }

    // Find the transaction
    const transaction = await Payment.findOne({ client_txn_id }).session(session);

    if (!transaction) {
      console.warn(`⚠️ Transaction not found: ${client_txn_id}`);
      await session.abortTransaction();
      return res.sendStatus(404);
    }

    // Skip if already processed
    if (transaction.status === "success") {
      console.log(`ℹ️ Transaction already processed: ${client_txn_id}`);
      await session.commitTransaction();
      return res.sendStatus(200);
    }

    // Update transaction record
    transaction.status = status;
    transaction.remark = remark || transaction.remark;
    transaction.upi_txn_id = upi_txn_id || transaction.upi_txn_id;
    transaction.updatedAt = new Date(txnAt || Date.now());

    await transaction.save({ session });

    // Update user balance if successful
    if (status === "success") {
      const user = await User.findById(transaction.userId).session(session);
      if (!user) {
        console.error(`❌ User not found for txn: ${client_txn_id}`);
        await session.abortTransaction();
        return res.sendStatus(404);
      }

      const walletBefore = user.availableBalance;
      user.availableBalance += transaction.amount;
      user.balance = user.availableBalance + user.bonusAmount;

      await user.save({ session });

      console.log(`✅ User balance updated: ₹${transaction.amount} for user ${user.Phone}`);

      // 🔐 Add account statement logging here
      const logResult = await logStatement({
        userId: user._id,
        type: "deposit",
        amount: transaction.amount,
        walletBefore,
        walletAfter: user.availableBalance,
        status: "success",
        description: "UPI deposit successful"
      });

      if (!logResult.success) {
        console.warn("⚠️ Failed to log account statement");
      }
    } else {
      console.log(`⚠️ Transaction not successful: ${status}`);
    }

    await session.commitTransaction();
    session.endSession();
    return res.sendStatus(200);
  } catch (error) {
    console.error("❌ Webhook Error:", error);
    await session.abortTransaction();
    session.endSession();
    return res.sendStatus(500);
  }
};


exports.getUpiDepositHistory = async (req, res) => {
  try {
    const userId = req.userId;

    // Fetch all payments made by the user, sorted by most recent
    const payments = await Payment.find({ userId })
      .sort({ createdAt: -1 })
      .select("-__v") // Exclude the __v field
      .lean(); // Convert Mongoose documents to plain JavaScript objects

    return res.status(200).json({
      status: true,
      message: "Deposit history fetched successfully.",
      data: payments,
    });
  } catch (error) {
    console.error("Error in getDepositHistory:", error);
    return InternalServerError(res, error);
  }
};

exports.getAllUpiDepositeHistory = async (req, res) => {
  try {
    const { status, page = 1, limit = 10, search } = req.query;
    let filter = {};

    const validStatuses = ["pending", "success", "failure"];
    if (status) {
      const statusArray = status.split(",").map((s) => s.trim());
      const filteredStatuses = statusArray.filter((s) => validStatuses.includes(s));
      if (filteredStatuses.length > 0) {
        filter.status = { $in: filteredStatuses };
      }
    }

    // UTR Number Search Filtering
    if (search) {
      filter.utrNumber = { $regex: search, $options: "i" };
    }

    // Pagination
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    const skip = (pageNumber - 1) * limitNumber;

    // Fetch deposit requests with pagination
    const depositRequests = await Payment.find(filter)
      .populate({ path: "userId", model: "user", select: "Phone" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .lean();

    const totalRecords = await Payment.countDocuments(filter);

    // Transform response
    const formattedRequests = depositRequests.map((request) => {
      const userPhone = request.userId?.Phone || null;
      const { userId, ...rest } = request;
      return { ...rest, userPhone };
    });

    // 🔥 Updated IST-based day range
    const istStartOfDay = moment().tz("Asia/Kolkata").startOf('day').toDate();
    const istEndOfDay = moment().tz("Asia/Kolkata").endOf('day').toDate();

    const todayTotalAmount = await Payment.aggregate([
      {
        $match: {
          status: "success",
          createdAt: { $gte: istStartOfDay, $lte: istEndOfDay },
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Deposit requests fetched successfully.",
      data: formattedRequests,
      pagination: {
        totalRecords,
        currentPage: pageNumber,
        pageSize: limitNumber,
      },
      todayApprovedTotal: todayTotalAmount.length > 0 ? todayTotalAmount[0].totalAmount : 0,
    });
  } catch (error) {
    console.error("Error in getAllDepositRequests:", error);
    return InternalServerError(res, error);
  }
};

exports.checUpiPaymentStatus = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { client_txn_id, txn_date } = req.body || {};

    if (!client_txn_id || !txn_date) {
      return res.status(400).json({ success: false, message: "Missing client_txn_id or txn_date" });
    }

    // 1. Call UPI Gateway API
    const apiKey = "fa35ab4d-558e-4610-a1d2-5e60306d517f";
    const payload = {
      key: apiKey,
      client_txn_id,
      txn_date
    };

    const { data: apiRes } = await axios.post("https://api.ekqr.in/api/check_order_status", payload);

    if (!apiRes.status || !apiRes.data) {
      console.warn("❌ UPI status check failed or no data returned");
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: apiRes.msg || "Transaction not found" });
    }

    const {
      amount,
      status: apiStatus,
      remark,
      upi_txn_id,
      txnAt
    } = apiRes.data;

    // 🔄 Map UPI API status to internal schema enum
    let internalStatus = "pending";

    if (apiStatus === "success") {
      internalStatus = "success";
    } else if (["failure", "closed", "cancelled"].includes(apiStatus)) {
      internalStatus = "failure";
    } else if (["scanning", "created"].includes(apiStatus)) {
      internalStatus = "pending";
    } else {
      console.warn(`⚠️ Unknown API status '${apiStatus}', defaulting to 'pending'`);
    }

    // 2. Find transaction in DB
    const transaction = await Payment.findOne({ client_txn_id }).session(session);
    if (!transaction) {
      console.warn(`⚠️ Transaction not found in DB: ${client_txn_id}`);
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Transaction not found in database" });
    }

    // Skip if already marked success
    if (transaction.status === "success") {
      console.log(`ℹ️ Transaction already marked success: ${client_txn_id}`);
      await session.commitTransaction();
      return res.status(200).json({ success: true, message: "Already processed" });
    }

    // 3. Update transaction
    transaction.status = internalStatus;
    transaction.remark = remark || transaction.remark;
    transaction.upi_txn_id = upi_txn_id || transaction.upi_txn_id;
    transaction.amount = amount || transaction.amount;
    transaction.updatedAt = new Date(txnAt || Date.now());

    console.log("💾 Updating transaction:", transaction);

    await transaction.save({ session });

    // 4. If success, update user wallet
    if (internalStatus === "success") {
      const user = await User.findById(transaction.userId).session(session);
      if (!user) {
        console.error(`❌ User not found for txn: ${client_txn_id}`);
        await session.abortTransaction();
        return res.status(404).json({ success: false, message: "User not found" });
      }

      const walletBefore = user.availableBalance;
      user.availableBalance += amount;
      user.balance = user.availableBalance + user.bonusAmount;

      await user.save({ session });

      const logResult = await logStatement({
        userId: user._id,
        type: "deposit",
        amount,
        walletBefore,
        walletAfter: user.availableBalance,
        status: "success",
        description: "Manual UPI deposit update"
      });

      if (!logResult.success) {
        console.warn("⚠️ Failed to log account statement");
      }

      console.log(`✅ Balance updated for user ${user.Phone}`);
    } else {
      console.log(`ℹ️ Transaction status set to '${internalStatus}' (from API status '${apiStatus}')`);
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Transaction status updated",
      status: internalStatus
    });
  } catch (err) {
    console.error("❌ Manual payment check error:", err);
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};


exports.updateTransactionStatus = async (req, res) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  if (!['success', 'failure'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const transaction = await Payment.findById(id).session(session);

    if (!transaction) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (transaction.status === 'success') {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Transaction already marked as success' });
    }

    transaction.status = status;
    if (status === 'failure') {
      transaction.remark = reason || 'No reason provided';
      await transaction.save({ session });

      await session.commitTransaction();
      return res.status(200).json({ success: true, message: 'Transaction marked as failure' });
    }

    // ✅ Status = success
    const user = await User.findById(transaction.userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const amount = transaction.amount;
    const walletBefore = user.availableBalance;

    user.availableBalance += amount;
    user.balance = user.availableBalance + user.bonusAmount;

    await user.save({ session });
    await transaction.save({ session });

    // 🧾 Log Statement
    const logResult = await logStatement({
      userId: user._id,
      type: "deposit",
      amount,
      walletBefore,
      walletAfter: user.availableBalance,
      status: "success",
      description: "Manual UPI deposit update by admin"
    });

    if (!logResult.success) {
      console.warn("⚠️ Failed to log account statement");
    }

    await session.commitTransaction();
    return res.status(200).json({ success: true, message: 'Transaction marked as success and balance updated' });

  } catch (err) {
    console.error("❌ Error updating transaction:", err);
    await session.abortTransaction();
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    session.endSession();
  }
};


