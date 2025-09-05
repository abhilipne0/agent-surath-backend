/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable radix */
/**
 * Config object
 */
require("dotenv").config();

const config = {
  env: process.env.NODE_ENV,
  port: process.env.PORT,
  baseUrl: process.env.BASE_URL,
  mongo: process.env.MONGO_URL,
  jwtSecret: process.env.JWT_SECRET_KEY,
  twilioConfig: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
  },
  smsBeepConfig: {
    username: process.env.SMSBEEP_USERNAME,
    password: process.env.SMSBEEP_PASSWORD,
    senderId: process.env.SMSBEEP_SENDER_ID,
  },
  s3BucketConfig: {
    baseUrl: process.env.S3_BASE_URL,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    region: process.env.S3_REGION,
    bucket: process.env.S3_BUCKET_NAME,
  },
  ssl: {
    keyPath: process.env.SSL_KEY_PATH,
    certPath: process.env.SSL_CERT_PATH,
  },
  live: {
    accessKey: process.env.ACCESS_KEY,
    secretKey: process.env.SECRET,
    roomId: process.env.ROOM_ID,
    issuer: process.env.ISSUER,
  },
};
/**
 * Exports config
 */
module.exports = config;
