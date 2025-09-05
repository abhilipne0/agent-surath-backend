const mongoose = require("mongoose");

const gameSessionSchema = new mongoose.Schema({
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  duration: { type: Number, default: 30 },
  result: { type: String }, // Winning card
  winners: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
      amountWon: { type: Number },
    },
  ],
  isEnded: { type: Boolean, default: false }, // New field to track if the game has ended
});

// Virtual field for bets
gameSessionSchema.virtual("bets", {
  ref: "Bet",
  localField: "_id",
  foreignField: "gameSessionId",
});

// Ensure virtual fields are serialized
gameSessionSchema.set("toObject", { virtuals: true });
gameSessionSchema.set("toJSON", { virtuals: true });

const GameSession = mongoose.model("GameSession", gameSessionSchema);
module.exports = GameSession;
