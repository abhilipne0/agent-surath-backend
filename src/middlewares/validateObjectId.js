const mongoose = require("mongoose");

/**
 * Middleware to validate MongoDB ObjectId in request parameters.
 *
 * @param {String} paramName - The name of the parameter to validate.
 */
const validateObjectId = (paramName) => (req, res, next) => {
  const id = req.params[paramName];
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      status: false,
      message: `Invalid ID format for ${paramName}.`,
    });
  }
  next();
};

module.exports = validateObjectId;
