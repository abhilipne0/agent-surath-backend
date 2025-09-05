const { RtcTokenBuilder, RtcRole } = require("agora-access-token");
const config = require("../../config");

const generateToken = (channel, uid, role) => {
  const { appId, appCertificate } = config.agora;

  let expirationInSeconds;
  if (role === "admin") {
    expirationInSeconds = 604800;
  } else {
    expirationInSeconds = 7200;
  }

  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpireTime = currentTimestamp + expirationInSeconds;

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channel,
    uid,
    role === "admin" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER,
    privilegeExpireTime
  );
  return token;
};

module.exports = { generateToken };
