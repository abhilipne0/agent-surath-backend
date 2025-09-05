const mongoose = require("mongoose");

const settingSchema = mongoose.Schema({
  game: {
    type: String,
    required: true,
  },
  key: {
    type: String,
    required: true,
  },
  value: {
    type: String,  // e.g., "automatic", "manual"
    required: true,
  }
});


module.exports = mongoose.model("Setting", settingSchema);
