const express = require("express");
const {
  createAdmin,
  loginAdmin,
  getTotalApprovedAmounts,
  manualDrawResult,
  setSessionMode,
  getSettings,
  addBankAccount,
  editBankAccount,
  setActiveBankAccount,
  getAllBankAccounts,
  getAllUsers,
  updateUserInfo,
  getUserBets
} = require("../../controllers/admin");
const allowOnlyAdmins = require("../../middlewares/allowedUsers");
const auth = require("../../middlewares/auth");
const { getBankAccountById } = require("../../controllers/bankAccounts");
const { getSessionBets, getAllGameSessions } = require("../../controllers/game/surath");
const abhiAdminAuth = require("../../middlewares/abhiAdmin");
// const { sendNotification, sendPushNotificationToAll } = require("../../controllers/admin/pushNotification");
const { getAndarBaharDailyStats, getAndarBaharSessionsWithStats, getAndarBaharSessionMode, setAndarBaharSessionMode } = require("../../controllers/game/andar-bahar");
const { getDragonTigerDailyStats, getDragonTigerSessionsWithStats, setDragonTigerSessionMode, getDragonTigerSessionMode } = require("../../controllers/game/dragon-tiger");

const router = express.Router();

// Route for creating an admin
router.post("/register", createAdmin);
router.post("/login", loginAdmin);
router.get("/withdraw/bank-account/:id", allowOnlyAdmins, getBankAccountById);
router.get("/total-approved-amounts", allowOnlyAdmins, getTotalApprovedAmounts);
router.post("/add-bank-account", allowOnlyAdmins, addBankAccount);
router.get("/get-bank-account", allowOnlyAdmins, getAllBankAccounts);
router.put("/set-active-bank-account", allowOnlyAdmins, setActiveBankAccount);
router.put("/edit-bank-account", allowOnlyAdmins, editBankAccount);
router.get("/all-User-list", abhiAdminAuth, getAllUsers);
router.put("/user/:userId", abhiAdminAuth, updateUserInfo);
router.get("/user/bets/:userId", abhiAdminAuth, getUserBets);


// Route related Surath game
router.get("/surath/all-sessions", abhiAdminAuth, getAllGameSessions);
router.post("/draw-result", allowOnlyAdmins, manualDrawResult);
router.get("/settings", allowOnlyAdmins, getSettings);
router.post("/set-session-mode", allowOnlyAdmins, setSessionMode);
router.post("/session/bets", allowOnlyAdmins, getSessionBets);

// adnar-bahar admin apis
router.get("/andar-bahar/status", allowOnlyAdmins, getAndarBaharDailyStats);
router.get("/andar-bahar/session-stats", allowOnlyAdmins, getAndarBaharSessionsWithStats);
router.get("/andar-bahar/get-session-mode", allowOnlyAdmins, getAndarBaharSessionMode);
router.post("/andar-bahar/set-session-mode", allowOnlyAdmins, setAndarBaharSessionMode);

// dragon-tiger admin apis
router.get("/dragon-tiger/status", allowOnlyAdmins, getDragonTigerDailyStats);
router.get("/dragon-tiger/session-stats", allowOnlyAdmins, getDragonTigerSessionsWithStats);
router.get("/dragon-tiger/get-session-mode", allowOnlyAdmins, getDragonTigerSessionMode);
router.post("/dragon-tiger/set-session-mode", allowOnlyAdmins, setDragonTigerSessionMode);

// router.post('/notification', sendPushNotificationToAll)

module.exports = router;
