const mongoose = require('mongoose');

const betSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  gameSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AndarBaharSession', required: true },
  amount: { type: Number, required: true },
  side: { type: String, enum: ['andar', 'bahar', 'tie'], required: true },
  isWinner: { type: Boolean, default: false },
  wonAmount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AndarBaharBet', betSchema);
