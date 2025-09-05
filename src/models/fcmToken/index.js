// models/FcmToken.js
const mongoose = require('mongoose');

const FcmTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  platform: { type: String, enum: ['android', 'ios'], required: true },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('FcmToken', FcmTokenSchema);
