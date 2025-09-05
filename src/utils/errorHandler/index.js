/**
 * Handles Internal Server Errors by sending a standardized JSON response.
 *
 * @param {Object} res - The Express response object.
 * @param {Error} error - The error object that was caught.
 */
function InternalServerError(res, error) {
  // Log the error details for debugging purposes
  console.error("Internal Server Error:", error);

  // Send a 500 Internal Server Error response
  res.status(500).json({
    status: false,
    message: "An unexpected error occurred. Please try again later.",
  });
}

module.exports = { InternalServerError };
