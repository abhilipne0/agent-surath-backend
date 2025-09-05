const mongoose = require("mongoose");
const config = require("../config");

const connectDb = async () => {
  try {
    const conn = await mongoose.connect(config.mongo);
    console.log("Database connected successfully");
  } catch (error) {
    console.log("error: ", error);
  }
};
module.exports = { connectDb };

// test
