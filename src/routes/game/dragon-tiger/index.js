const express = require("express");
const auth = require("../../../middlewares/auth");
const { placeDragonTigerBet, getDragonTigerBets, getHistory } = require("../../../controllers/game/dragon-tiger");

const router = express.Router();

// For placing bet
router.post("/bet-place", auth, placeDragonTigerBet);

router.get("/current/bets", auth, getDragonTigerBets);

router.get("/history", auth, getHistory);

// Route to get current session status
// router.get("/current/session", auth, getCurrentSession);

module.exports = router;
