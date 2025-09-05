const mongoose = require('mongoose');

const cardSchema = {
  suit: String,
  value: String
};

const gameSessionSchema = new mongoose.Schema({
  mainCard: cardSchema,
  matchCard: cardSchema,
  matchIndex: Number,
  side: String,
  otherCards: [cardSchema],
  startTime: Date,
  endTime: Date,
  duration: Number, // in seconds
  isEnded: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('AndarBaharSession', gameSessionSchema);
