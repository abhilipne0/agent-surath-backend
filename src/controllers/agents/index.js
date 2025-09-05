const Agent = require('../../models/agent');
const AgentTransaction = require("../../models/agentTransactions");

// Create a new agent
const createAgent = async (req, res) => {
    try {
        const { name, mobile, email, password, coin_percentage, location, status, coin_refundable } = req.body;

        if (!password) {
            return res.status(400).json({ success: false, message: 'Password is required' });
        }

        const agent = new Agent({
            name,
            mobile,
            email,
            password, // <-- save password
            coin_percentage,
            location,
            status,
            coin_refundable
        });

        await agent.save();
        res.status(201).json({ success: true, data: agent });
    } catch (err) {
        console.error(err);
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'Email or Agent ID already exists' });
        }
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Edit an agent
const editAgent = async (req, res) => {
    try {
        const { agentId } = req.params;

        // Disallow coin-related fields from being updated here
        const {
            coins_balance,
            coins_added_by_admin,
            coins_distributed_to_users,
            coins_received_from_users,
            ...allowedFields
        } = req.body;

        const updateData = {
            ...allowedFields,
            updated_at: new Date()
        };

        const updatedAgent = await Agent.findOneAndUpdate(
            { agent_id: agentId },
            updateData,
            { new: true }
        );

        if (!updatedAgent) {
            return res.status(404).json({ success: false, message: 'Agent not found' });
        }

        res.status(200).json({ success: true, data: updatedAgent });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};


// Get all agents with pagination and optional filter by agent_id
const getAgents = async (req, res) => {
    try {
        let { page = 1, limit = 10, search } = req.query;
        page = Math.max(1, parseInt(page));
        limit = Math.min(100, parseInt(limit)); // Limit max page size to 100

        const query = {};
        if (search) {
            query.agent_id = { $regex: search, $options: 'i' }; // case-insensitive search
        }

        const total = await Agent.countDocuments(query);
        const agents = await Agent.find(query)
            .skip((page - 1) * limit)
            .limit(limit)
            .sort({ created_at: -1 });

        res.status(200).json({
            success: true,
            data: agents,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }

    // GOOD ✅ (exported properly)
    const updateAgentBalanceByAdmin = async (req, res) => {
        try {
            const { agentId } = req.params;
            const { type, amount } = req.body;

            if (!["add", "remove"].includes(type)) {
                return res.status(400).json({ success: false, message: "Invalid transaction type" });
            }

            if (amount <= 0) {
                return res.status(400).json({ success: false, message: "Amount must be greater than 0" });
            }

            const agent = await Agent.findById(agentId);
            if (!agent) {
                return res.status(404).json({ success: false, message: "Agent not found" });
            }

            const agentBalanceBefore = agent.coins_balance;

            if (type === "add") {
                agent.coins_balance += amount;
                agent.coins_added_by_admin += amount;
            } else if (type === "remove") {
                if (agent.coins_balance < amount) {
                    return res.status(400).json({ success: false, message: "Insufficient agent balance" });
                }
                agent.coins_balance -= amount;
            }

            await agent.save();

            const transaction = new AgentTransaction({
                agentId: agent._id,
                userId: null,
                type,
                amount,
                agentBalanceBefore,
                agentBalanceAfter: agent.coins_balance,
                userBalanceBefore: 0,
                userBalanceAfter: 0,
                createdBy: "admin"
            });

            await transaction.save();

            res.status(200).json({
                success: true,
                message: `Coins ${type === "add" ? "added to" : "removed from"} agent successfully`,
                agent,
                transaction
            });
        } catch (err) {
            console.error("Error in updateAgentBalanceByAdmin:", err);
            res.status(500).json({ success: false, message: "Server Error" });
        }
    };

};

// GOOD ✅ (exported properly)
const updateAgentBalanceByAdmin = async (req, res) => {
    try {
        const { agentId } = req.params;
        const { type, amount } = req.body;

        if (!["add", "remove"].includes(type)) {
            return res.status(400).json({ success: false, message: "Invalid transaction type" });
        }

        if (amount <= 0) {
            return res.status(400).json({ success: false, message: "Amount must be greater than 0" });
        }

        const agent = await Agent.findById(agentId);
        if (!agent) {
            return res.status(404).json({ success: false, message: "Agent not found" });
        }

        const agentBalanceBefore = agent.coins_balance;

        if (type === "add") {
            agent.coins_balance += amount;
            agent.coins_added_by_admin += amount;
        } else if (type === "remove") {
            if (agent.coins_balance < amount) {
                return res.status(400).json({ success: false, message: "Insufficient agent balance" });
            }
            agent.coins_balance -= amount;
        }

        await agent.save();

        const transaction = new AgentTransaction({
            agentId: agent._id,
            userId: null,
            type,
            amount,
            agentBalanceBefore,
            agentBalanceAfter: agent.coins_balance,
            userBalanceBefore: 0,
            userBalanceAfter: 0,
            createdBy: "admin"
        });

        await transaction.save();

        res.status(200).json({
            success: true,
            message: `Coins ${type === "add" ? "added to" : "removed from"} agent successfully`,
            agent,
            transaction
        });
    } catch (err) {
        console.error("Error in updateAgentBalanceByAdmin:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};


module.exports = {
    createAgent,
    editAgent,
    getAgents,
    updateAgentBalanceByAdmin
};
