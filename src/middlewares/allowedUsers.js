const jwt = require("jsonwebtoken");
const Admin = require("../models/admin");
const config = require("../config");

const allowOnlyAdmins = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No token provided." });
    }

    const decoded = jwt.verify(token, config.jwtSecret);
    const adminId = decoded.id;
    const role = decoded.role;

    if (role !== "admin") {
      return res.status(403).json({ message: "Forbidden: Access is denied." });
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found." });
    }

    req.body.adminId = adminId; // Attach adminId to the request object
    req.body.role = role; // Attach adminId to the request object
    next();
  } catch (error) {
    console.error("Error in allowOnlyCertainUsers middleware:", error);
    return res.status(401).json({ message: "Unauthorized: Invalid token." });
  }
};

module.exports = allowOnlyAdmins;
