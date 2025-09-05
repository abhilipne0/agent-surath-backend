const jwt = require("jsonwebtoken");
const config = require("../config");

// Middleware to verify admin token
const abhiAdminAuth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (token) {
      // Decode the token
      const decoded = jwt.verify(token, config.jwtSecret);

      // Check if the decoded data matches the specific admin credentials
      if (
        decoded.email === "mobasirshaikh7204@gmail.com" &&
        decoded.mobile === "9130203486" &&
        decoded.role === "admin"
      ) {
        req.admin = decoded; // Attach admin info to the request
        return next();
      }
    }

    // Forbidden if validation fails
    return res.status(403).json({ message: "Forbidden: Invalid admin access" });
  } catch (err) {
    console.error("Error in specificAdminAuth middleware:", err);
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
};

module.exports = abhiAdminAuth;
