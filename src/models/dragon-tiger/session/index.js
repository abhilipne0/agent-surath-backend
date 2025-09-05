const mongoose = require("mongoose");

const CardSchema = new mongoose.Schema({
  rank: String,
  suit: String,
});

const DragonTigerSessionSchema = new mongoose.Schema({
  sessionId: Number,
  dragonCard: CardSchema,
  tigerCard: CardSchema,
  winner: String,
  startTime: Date,
  endTime: Date,
  isEnded: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("DragonTigerSession", DragonTigerSessionSchema);
