const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        return res.status(401).json({
          code: "USER_NOT_FOUND",
          message: "Not authorized, user not found",
        });
      }

      // ── Impersonation tokens skip ALL session validation ─────────────────
      // They are short-lived (1h) and issued by a trusted internal user.
      // Session version checks don't apply because the impersonated user
      // never "logged in" themselves — they were accessed by an Admin/BrokerageAdmin.
      if (decoded.platform === "impersonate") {
        req.user = user;
        req.isImpersonated = true; // useful for audit logging later
        return next();
      }

      // ==========================
      // Validate Web Session
      // ==========================
      if (decoded.platform === "web") {
        const versionField =
          decoded.portal === "internal"
            ? "internalWebSessionVersion"
            : "externalWebSessionVersion";

        if (user[versionField] !== decoded.sessionVersion) {
          return res.status(401).json({
            code: "SESSION_REPLACED",
            message:
              decoded.portal === "internal"
                ? "Your session has expired. Please login again."
                : "Your session ended because you signed in from another browser.",
          });
        }
      }

      req.user = user;

      next();
    } catch (err) {
      console.error(err);
      return res.status(401).json({
        code: "INVALID_TOKEN",
        message: "Not authorized, token failed",
      });
    }
  } else {
    return res.status(401).json({
      code: "NO_TOKEN",
      message: "Not authorized, no token",
    });
  }
};

// Role-based: pass one or more allowed roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      res.status(403);
      throw new Error(`User role ${req.user.role} is not authorized`);
    }
    next();
  };
};

module.exports = {
  protect,
  authorize,
};
