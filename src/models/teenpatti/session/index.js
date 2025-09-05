const mongoose = require("mongoose");

const teenPattiSessionSchema = new mongoose.Schema({
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    duration: { type: Number, default: 30 }, // in seconds
    isEnded: { type: Boolean, default: false },
    playerCards: { type: [[{ suit: String, value: String }]], default: [] }, // array of 2 players x 3 cards
    winner: { type: Number, enum: [1, 2], default: null }, // 1 or 2
}, { timestamps: true });

module.exports = mongoose.model("TeenPattiGame", teenPattiSessionSchema);
