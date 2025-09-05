const express = require("express");
const { placeAndarBaharBet,  getAndarBaharBets, getHistory } = require("../../../controllers/game/andar-bahar");
const auth = require("../../../middlewares/auth");

const router = express.Router();

// For placing bet
router.post("/bet-place", auth, placeAndarBaharBet); // For testing purpose

router.get("/current/bets", auth, getAndarBaharBets);

router.get("/history",auth, getHistory);


module.exports = router;
