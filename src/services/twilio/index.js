require("dotenv").config();
const crypto = require("crypto");
const axios = require("axios");
const bcrypt = require("bcrypt");

const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

const sendOTPSMS = async (phone, otp) => {
  const message = `Your One Time Password is ${otp}. Thanks SMSINDIAHUB`;
  const apiKey = "3Y24OVv0IESOugqxZVxkvA"; // Replace with your actual API key
  // Sorath : 00cxhGtWd0q6VVL6XXWmpA
  // Sunil : 3Y24OVv0IESOugqxZVxkvA
  const senderId = "AREPLY";
  const gatewayId = 2;

  const url = `http://cloud.smsindiahub.in/vendorsms/pushsms.aspx?APIKey=${apiKey}&msisdn=${phone}&sid=${senderId}&msg=${encodeURIComponent(message)}&fl=0&gwid=${gatewayId}`;

  try {
    const response = await axios.get(url);
    console.log("SMS API Response:", response.data);
  } catch (error) {
    console.error("Error sending SMS:", error.message);
  }
};

const hashOTP = async (otp) => {
  const saltRounds = 10;
  return await bcrypt.hash(otp, saltRounds);
};

module.exports = { generateOTP, sendOTPSMS, hashOTP };
