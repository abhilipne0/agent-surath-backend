const jwt = require("jsonwebtoken");
const config = require("../config");

const auth = (req, res, next) => {
  try {
    let token = req.headers.authorization;

    // ChecCk if the authorization header is present and has the correct format
    if (token && token.split(" ").length === 2) {
      token = token.split(" ")[1];

      // Verify the token
      let user = jwt.verify(token, config.jwtSecret);

      // Attach the user ID to the request
      req.userId = user?.id;

      req.body.userId = user?.id;

      // Call next to pass control to the next middleware or route handler
      next();
    } else {
      // If the token is missing or has an incorrect format, send an unauthorized response
      return res.status(401).json({ message: "Unauthorized User" });
    }
  } catch (err) {
    // Handle JWT verification errors
    console.error("error", err);

    // Check if headers have already been sent
    if (!res.headersSent) {
      // Send an unauthorized response
      return res.status(401).json({ message: "Unauthorized User" });
    }
  }
};

module.exports = auth;
