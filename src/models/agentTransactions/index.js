const mongoose = require("mongoose");

const agentTransactionSchema = new mongoose.Schema({
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
    type: { type: String, enum: ["add", "remove"], required: true }, // add = Agent → User, remove = User → Agent
    amount: { type: Number, required: true },

    // Balances snapshot
    agentBalanceBefore: { type: Number, required: true },
    agentBalanceAfter: { type: Number, required: true },
    userBalanceBefore: { type: Number, required: true },
    userBalanceAfter: { type: Number, required: true },

    createdBy: { type: String, enum: ["agent", "admin"], default: "agent" }, // who initiated
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("AgentTransaction", agentTransactionSchema);
