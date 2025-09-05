const mongoose = require("mongoose");

const teenPattiBetSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    gameSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "TeenPattiGame", required: true },
    player: { type: Number, enum: [1, 2], required: true }, // bet on Player 1 or 2
    amount: { type: Number, required: true },
    isWinner: { type: Boolean, default: false },
    amountWon: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model("TeenPattiBet", teenPattiBetSchema);
