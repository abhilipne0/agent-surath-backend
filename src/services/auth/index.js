const jwt = require("jsonwebtoken");
const config = require("../../config");
/**
 * Generates a JWT token for the authenticated user.
 *
 * @param {Object} user - The user object from the database.
 * @returns {String} - The signed JWT token.
 */
function generateAuthToken(user, isAdmin = false) {
  let payload;

  if (isAdmin) {
    payload = {
      id: user._id,
      email: user.email,
      role: user.role,
      mobile: user.mobileNumber,
    };
  } else {
    // For agent
    console.log("agent =>", user)
    payload = {
      id: user._id,
      email: user.email,
      role: user.role,
      agentId: user.agent_id, // Include agent's own ID for reference
    };
  }

  const token = jwt.sign(payload, config.jwtSecret, {
    expiresIn: 32000, // you can adjust this
  });

  return token;
}


module.exports = { generateAuthToken };
