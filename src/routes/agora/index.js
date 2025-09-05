const express = require("express");
const jwt = require("jsonwebtoken");
const allowOnlyAdmins = require("../../middlewares/allowedUsers");
const router = express.Router();
const config = require("../../config/index");
const auth = require("../../middlewares/auth");

const ACCESS_KEY = config.live.accessKey;
const SECRET = config.live.secretKey;
const ROOM_ID = config.live.roomId;
const ISSUER = config.live.issuer;

router.post('/admin/generate-token', allowOnlyAdmins, (req, res) => {
    const { adminId } = req.body;

    const role = 'broadcaster'

    if (!adminId || !role) {
        return res.status(400).json({ error: "adminId and role are required." });
    }

    // Define payload
    const payload = {
        access_key: ACCESS_KEY,
        room_id: ROOM_ID,
        user_id: adminId,           // User ID (Ensure this matches the format expected by 100ms, like UUID)
        role: role,                // Role ('broadcaster' for admin/host, 'viewer-realtime' for users)
        type: "app",               // Token type
        version: 2,                // API version
        jti: `${adminId}-${Date.now()}`, // Unique identifier for the token
        iat: Math.floor(Date.now() / 1000), // Issued At
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // Expiration (24 hours)
    };

    const options = {
        issuer: ISSUER,  // Correct issuer value
    };

    try {
        const token = jwt.sign(payload, SECRET, options);
        res.status(200).json({ token });
    } catch (error) {
        console.error("Error generating token:", error);
        res.status(500).json({ error: "Error generating token." });
    }
});


router.post('/user/generate-token', auth, (req, res) => {
    const { userId } = req.body;

    const role = 'viewer-realtime'

    if (!userId || !role) {
        return res.status(400).json({ error: "userId and role are required." });
    }

    // Define payload
    const payload = {
        access_key: ACCESS_KEY,
        room_id: ROOM_ID,
        user_id: userId,           // User ID (Ensure this matches the format expected by 100ms, like UUID)
        role: role,                // Role ('broadcaster' for admin/host, 'viewer-realtime' for users)
        type: "app",               // Token type
        version: 2,                // API version
        jti: `${userId}-${Date.now()}`, // Unique identifier for the token
        iat: Math.floor(Date.now() / 1000), // Issued At
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // Expiration (24 hours)
    };

    const options = {
        issuer: ISSUER,  // Correct issuer value
    };

    try {
        const token = jwt.sign(payload, SECRET, options);
        res.status(200).json({ token });
    } catch (error) {
        console.error("Error generating token:", error);
        res.status(500).json({ error: "Error generating token." });
    }
});

module.exports = router;
