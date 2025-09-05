const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const agentSchema = new mongoose.Schema({
    agent_id: { type: String, unique: true, default: () => nanoid(10) },
    name: { type: String, required: true },
    mobile: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // will store plain text
    coin_percentage: { type: Number, required: true, min: 1, max: 100 },
    location: { type: String },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    coin_refundable: { type: String, enum: ['Yes', 'No'], default: 'Yes' },
    coins_balance: { type: Number, default: 0 },
    coins_added_by_admin: { type: Number, default: 0 },
    coins_distributed_to_users: { type: Number, default: 0 },
    coins_received_from_users: { type: Number, default: 0 },
    total_users: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    role: { type: String, required: true, default: 'agent' }
});

module.exports = mongoose.model('Agent', agentSchema);
