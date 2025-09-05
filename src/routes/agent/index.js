const express = require("express");
const { createAgent, editAgent, getAgents, updateAgentBalanceByAdmin } = require("../../controllers/agents");
const agentRouter = express.Router();
const abhiAdminAuth = require("../../middlewares/abhiAdmin");
const { createUserByAgent, getAllUsersByAgent, updateUserByAgent, updateUserAmountByAgent, getAgentTransactions, getUserTransactions } = require("../../controllers/user/agentUser");
const agentAuth = require("../../middlewares/allowAgent");

// Agen Routes For Admin
agentRouter.post("/create", abhiAdminAuth, createAgent);
agentRouter.put("/edit/:agentId", abhiAdminAuth, editAgent);
// console.log("updateAgentBalanceByAdmin:", updateAgentBalanceByAdmin);
agentRouter.post("/:agentId/balance", abhiAdminAuth, updateAgentBalanceByAdmin);
agentRouter.get("/", abhiAdminAuth, getAgents);

// Create user for agent
agentRouter.post("/user/create", agentAuth, createUserByAgent);

// Get all users for agent
agentRouter.get("/users", agentAuth, getAllUsersByAgent);

// Update user info
agentRouter.put("/users/:userId", agentAuth, updateUserByAgent);

// Update user amount
agentRouter.put("/users/:userId/fund", agentAuth, updateUserAmountByAgent);

// agent history 
agentRouter.get("/transactions/history", agentAuth, getAgentTransactions);

// user transaction
agentRouter.get("/user/:userId/transactions", agentAuth, getUserTransactions);

module.exports = agentRouter;
