const express = require("express");
const multer = require("multer");
const {
  addDeposit,
  getDepositHistory,
  getAllDepositRequests,
  approveDepositRequest,
  rejectDepositRequest,
} = require("../../controllers/payment");
const auth = require("../../middlewares/auth");
const allowOnlyAdmins = require("../../middlewares/allowedUsers");
const validateObjectId = require("../../middlewares/validateObjectId");

const router = express.Router();

// Configure multer storage as memory storage
const storage = multer.memoryStorage();

// File type and size validation (optional)
const fileFilter = (req, file, cb) => {
  // Accept images only
  if (
    file.mimetype === "image/jpeg" ||
    file.mimetype === "image/png" ||
    file.mimetype === "image/gif"
  ) {
    cb(null, true);
  } else {
    cb(
      new Error("Invalid file type. Only JPEG, PNG, and GIF are allowed."),
      false
    );
  }
};

// Initialize multer with file type validation and size limit (e.g., 5MB)
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Route to add deposit
router.post("/add/deposit", auth, upload.single("paymentScreenshot"), addDeposit);

// Route to get deposit history
router.get("/deposit/history", auth, getDepositHistory);

// Route to get all deposit requests
router.get("/all-deposit-requests", allowOnlyAdmins, getAllDepositRequests);

// Route to approve a deposit request (admin only)
router.patch("/approve-deposit/:depositId", allowOnlyAdmins, validateObjectId("depositId"), approveDepositRequest);

// Route to reject a deposit request (admin only)
router.patch("/reject-deposit/:depositId", allowOnlyAdmins, validateObjectId("depositId"), rejectDepositRequest);

module.exports = router;
