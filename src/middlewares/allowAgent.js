const jwt = require("jsonwebtoken");
const config = require("../config");
const Agent = require("../models/agent"); // Adjust path

// Middleware to protect agent routes
const agentAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ error: "Authorization token missing." });
        }

        const token = authHeader.split(" ")[1];

        // Verify JWT
        let decoded;
        try {
            decoded = jwt.verify(token, config.jwtSecret);
        } catch (err) {
            return res.status(401).json({ error: "Invalid or expired token." });
        }

        // Ensure this token belongs to an agent
        if (decoded.role !== "agent") {
            return res.status(403).json({ error: "Access denied. Not an agent." });
        }

        // Fetch agent info from DB (optional, if you want full details)
        const agent = await Agent.findById(decoded.id);
        if (!agent) {
            return res.status(404).json({ error: "Agent not found." });
        }

        // ❌ Block inactive agents
        if (agent.status !== "Active") {
            return res.status(403).json({ error: "Your account is inactive. Please contact admin." });
        }

        // Attach agent info to request
        req.agent = agent; // full agent object
        req.agentId = agent.agent_id; // agentId for convenience
        req._id = agent._id

        next();
    } catch (error) {
        console.error("Agent auth middleware error:", error);
        return res.status(500).json({ error: "Server error." });
    }
};

module.exports = agentAuth;
