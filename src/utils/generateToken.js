const jwt = require("jsonwebtoken");


const EXPIRES_IN = {
  web: "7d",
  mobile: "90d",
  impersonate: "7d",
};

const generateToken = ({ user, platform, portal, impersonator }) => {
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

  // Impersonation: tie the token to the impersonator's current session
  if (platform === "impersonate" && impersonator) {
    payload.impersonatedBy = impersonator._id;
    payload.impersonatorSessionVersion = impersonator.internalWebSessionVersion;
  }

  const expiresIn = EXPIRES_IN[platform] || "7d";

  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

module.exports = generateToken;
