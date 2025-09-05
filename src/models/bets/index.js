const mongoose = require('mongoose');

const betSchema = new mongoose.Schema({
  gameSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'GameSession'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  card: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  isWinner: {
    type: Boolean,
    default: false
  },
  amountWon: {
    type: Number,
    default: 0
  },
  betCreatedAt: {
    type: Date,
  }
});

// Before saving, set amountWon = 9x amount
betSchema.pre('save', function (next) {
  if (this.isNew || this.isModified('amount')) {
    this.amountWon = this.amount * 9;
  }
  next();
});

module.exports = mongoose.model('Bet', betSchema);