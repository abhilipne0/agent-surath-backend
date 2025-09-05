const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  client_txn_id: { type: String, required: true, unique: true },
  amount: Number,
  customer_name: String,
  customer_email: String,
  customer_mobile: String,
  p_info: String,
 status: {
  type: String,
  enum: ['pending', 'success', 'failure', 'cancelled'],
  default: 'pending'
},
  remark: String,
  upi_txn_id: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,
  userId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true}
});

module.exports = mongoose.model('Transaction', transactionSchema);
