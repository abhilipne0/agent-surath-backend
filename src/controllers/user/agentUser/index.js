const User = require("../../../models/users");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const Agent = require("../../../models/agent");
const AgentTransaction = require("../../../models/agentTransactions");
const mongoose = require("mongoose");
const logStatement = require("../../../utils/logStatement");
const userTransaction = require("../../../models/AccountStatement")

// Helper to generate unique referral code
const generateReferralCode = () => {
    return crypto.randomBytes(3).toString("hex").toUpperCase();
};

// Create user through agent
const createUserByAgent = async (req, res) => {
    try {
        const agentId = req.agentId; // Agent creating this user
        const { name, phone, password, referredBy } = req.body;

        console.log("req.body =>", req.body)

        if (!agentId) {
            return res.status(400).json({ message: "Agent ID is required." });
        }
        if (!phone) {
            return res.status(400).json({ message: "Phone number is required." });
        }

        // Check if phone already exists
        const existingUser = await User.findOne({ phone });
        if (existingUser) {
            return res.status(400).json({ message: "User with this phone already exists." });
        }

        const newUser = new User({
            name,
            phone,
            password, // Ideally hash password before saving
            agentId,
            createdBy: "agent",
            referralCode: generateReferralCode(),
            referredBy: referredBy || null,
            isVerified: true, // Agent-created users may be auto-verified
            isRegistered: true, // Agent-created users considered registered
        });

        await newUser.save();

        return res.status(201).json({ message: "User created successfully.", user: newUser });
    } catch (error) {
        console.error("Error creating user via agent:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

// 1️⃣ Get all users created by this agent
const getAllUsersByAgent = async (req, res) => {
    try {
        const agentId = req.agentId; // from auth middleware
        const { search } = req.query; // search param from frontend

        let query = { agentId };

        // Add case-insensitive search by user name
        if (search) {
            query.name = { $regex: search, $options: "i" };
        }

        // Fetch users
        const users = await User.find(query).sort({ createdAt: -1 });

        // Directly send users with stored password (as it is in DB)
        return res.status(200).json({ users });
    } catch (error) {
        console.error("Error fetching users:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};


const updateUserByAgent = async (req, res) => {
    try {
        const agentId = req.agentId;
        const { userId } = req.params;
        const { name, phone, password, status } = req.body;

        // Find user created by this agent
        const user = await User.findOne({ _id: userId, agentId });
        if (!user) {
            return res.status(404).json({ message: "User not found or not created by you." });
        }

        if (name) user.name = name;
        if (phone) user.phone = phone;

        // Update password securely
        if (password) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            user.password = hashedPassword;
        }

        if (typeof status !== "undefined") {
            user.status = status; // expect boolean true/false
        }

        console.log("user =>", user)

        await user.save();

        return res.status(200).json({ message: "User updated successfully.", user });
    } catch (error) {
        console.error("Error updating user:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

// 3️⃣ Update user amount securely (availableBalance + balance)
const updateUserAmountByAgent = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const agentId = req._id;
        const { userId } = req.params;
        const { amount, type } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: "Amount must be greater than zero." });
        }

        const agent = await Agent.findById(agentId).session(session);
        if (!agent) {
            await session.abortTransaction();
            return res.status(404).json({ message: "Agent not found." });
        }

        const user = await User.findOne({ _id: userId, agentId: agent.agent_id }).session(session);
        if (!user) {
            await session.abortTransaction();
            return res.status(404).json({ message: "User not found or not created by this agent." });
        }

        // Save balances before
        const agentBalanceBefore = agent.coins_balance;
        const userBalanceBefore = user.availableBalance;

        if (type === "add") {
            if (agent.coins_balance < amount) {
                await session.abortTransaction();
                return res.status(400).json({ message: "Agent does not have enough balance." });
            }

            agent.coins_balance -= amount;
            agent.coins_distributed_to_users += amount;

            user.availableBalance += amount;

        } else if (type === "remove") {
            if (user.availableBalance < amount) {
                await session.abortTransaction();
                return res.status(400).json({ message: "User does not have enough balance." });
            }

            agent.coins_balance += amount;
            agent.coins_received_from_users += amount;

            user.availableBalance -= amount;

        } else {
            await session.abortTransaction();
            return res.status(400).json({ message: "Invalid transaction type." });
        }

        // Round values
        agent.coins_balance = Math.round((agent.coins_balance + Number.EPSILON) * 100) / 100;
        user.availableBalance = Math.round((user.availableBalance + Number.EPSILON) * 100) / 100;
        user.balance = Math.round((user.availableBalance + user.bonusAmount + Number.EPSILON) * 100) / 100;

        // Save updates
        await agent.save({ session });
        await user.save({ session });

        // Log transaction
        await AgentTransaction.create([{
            agentId: agent._id,
            userId: user._id,
            type,
            amount,
            agentBalanceBefore,
            agentBalanceAfter: agent.coins_balance,
            userBalanceBefore,
            userBalanceAfter: user.availableBalance,
            createdBy: "agent"
        }], { session });

        await logStatement({
            userId: user._id,
            type: type === "add" ? "deposit" : "withdraw_request",
            amount,
            walletBefore: userBalanceBefore,
            walletAfter: user.availableBalance,
            description: `Balance ${type}ed by agent`
        });


        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            message: `Transaction successful: ${type} ${amount}`,
            agent,
            user
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error in transaction:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

const getAgentTransactions = async (req, res) => {
    try {
        const { role, agentId } = req; // from auth middleware
        const { page = 1, limit = 10, type, userId, userName } = req.query;

        const filter = {};
        if (role === "agent") {
            filter.agentId = agentId;
        }
        if (type) filter.type = type;
        if (userId) filter.userId = userId;

        // 🔎 Filter by user name
        if (userName) {
            const matchingUsers = await User.find(
                { name: new RegExp(userName, "i") }, // case-insensitive search
                "_id"
            );

            if (matchingUsers.length > 0) {
                filter.userId = { $in: matchingUsers.map(u => u._id) };
            } else {
                // no users match → return empty result quickly
                return res.status(200).json({
                    transactions: [],
                    total: 0,
                    page: Number(page),
                    pages: 0,
                });
            }
        }

        const transactions = await AgentTransaction.find(filter)
            .populate("agentId", "name email")
            .populate("userId", "name phone")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const total = await AgentTransaction.countDocuments(filter);

        return res.status(200).json({
            transactions,
            total,
            page: Number(page),
            pages: Math.ceil(total / limit),
        });
    } catch (error) {
        console.error("Error fetching transactions:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

const getUserTransactions = async (req, res) => {
    try {
        const { userId } = req.params;
        const agentId = req.agentId; // logged-in agent id from auth middleware
        const role = req.agent.role;

        if (role !== "agent") {
            return res.status(403).json({ message: "Only agents can view user transactions" });
        }

        // Check if user belongs to this agent
        const user = await User.findOne({ _id: userId, agentId });
        if (!user) {
            return res.status(403).json({ message: "This user does not belong to you" });
        }

        // Pagination params
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Fetch transactions with pagination, latest first
        const [transactions, total] = await Promise.all([
            userTransaction.find({ userId })
                .sort({ timestamp: -1 }) // ✅ latest first
                .skip(skip)
                .limit(limit),
            userTransaction.countDocuments({ userId })
        ]);

        const totalPages = Math.ceil(total / limit);

        res.json({
            success: true,
            transactions,
            page,
            total,
            totalPages
        });
    } catch (error) {
        console.error("Error fetching user transactions:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};





module.exports = { createUserByAgent, getAllUsersByAgent, updateUserByAgent, updateUserAmountByAgent, getAgentTransactions, getUserTransactions };
