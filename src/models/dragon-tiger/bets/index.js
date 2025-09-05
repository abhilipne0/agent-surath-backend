const mongoose = require('mongoose');

const betSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  gameSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DragonTigerSession', required: true },
  amount: { type: Number, required: true },
  amountWon: { type: Number, required: true },
  side: { type: String, enum: ['dragon', 'tiger', 'tie'], required: true },
  isWinner: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DragonTigerBet', betSchema);
