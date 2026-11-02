const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { sendError } = require("../utils/response");

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

      // ── Impersonation (Login As) ─────────────────────────────────────────
      // The impersonated user never logged in themselves, so their own session
      // version is not checked. Instead the token is valid only while the
      // Admin / BrokerageAdmin who started it is still active and on the same
      // session (logging in elsewhere or changing password ends it).
      if (decoded.platform === "impersonate") {
        // Older tokens (issued before this change) have no impersonatedBy —
        // they keep working until they expire.
        if (decoded.impersonatedBy) {
          const impersonator = await User.findById(decoded.impersonatedBy)
            .select("isActive internalWebSessionVersion")
            .lean();

          if (
            !impersonator ||
            !impersonator.isActive ||
            impersonator.internalWebSessionVersion !==
              decoded.impersonatorSessionVersion
          ) {
            return res.status(401).json({
              code: "SESSION_REPLACED",
              message: "Your Login As session has ended. Please login again.",
            });
          }
        }

        req.user = user;
        req.isImpersonated = true; // useful for audit logging later
        req.impersonatedBy = decoded.impersonatedBy || null;
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
    if (!req.user) {
      return sendError(res, "Not authenticated", 401);
    }

    if (!roles.includes(req.user.role)) {
      return sendError(
        res,
        `User role ${req.user.role} is not authorized`,
        403,
        "ROLE_NOT_AUTHORIZED",
      );
    }

    next();
  };
};

module.exports = {
  protect,
  authorize,
};
