const jwt = require("jsonwebtoken");

const generateToken = ({ user, platform, portal }) => {
  const payload = {
    id: user._id,
    role: user.role,
    platform,
    portal,
  };

  // Only web sessions participate in single-login enforcement
  if (platform === "web") {
    payload.sessionVersion =
      portal === "internal"
        ? user.internalWebSessionVersion
        : user.externalWebSessionVersion;
  }

  // Impersonation tokens do NOT carry sessionVersion —
  // they bypass session checks in middleware entirely
  // and expire in 1 hour for security
  const expiresIn =
    platform === "mobile" ? "90d" : platform === "impersonate" ? "1h" : "7d";

  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

module.exports = generateToken;
