const express = require("express");
const { placeBet, getCurrentSession, getBets, getLastResults } = require("../../../controllers/game/surath");
const auth = require("../../../middlewares/auth");

const router = express.Router();

// For placing bet
router.post("/bet-place", auth, placeBet); // For testing purpose

router.get("/current/bets", auth, getBets);

router.get("/result",auth, getLastResults);

// Route to get current session status
router.get("/current/session", auth, getCurrentSession);

module.exports = router;
