const express = require("express");
const surathRouter = require("./surath");
const andarBaharRouter = require("./andar-bahar");
const dragonTigerRouter = require("./dragon-tiger");

const router = express.Router();

// Surath game routes will be available at /game/surath
router.use("/surath", surathRouter);

// Andar Bahar game routes will be available at /game/andar-bahar
router.use("/andar-bahar", andarBaharRouter);

// Dragon Tiger game routes will be available at /game/dragon-tiger
router.use("/dragon-tiger", dragonTigerRouter);

module.exports = router;
