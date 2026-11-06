const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const { protect, authorize } = require("../../middleware/authMiddleware");
const {
  loginInternal,

  updateProfile,
  changePassword,
  impersonateVendor,
  getProfile,
} = require("../../controllers/internalUsers/authController");
const validate = require("../../middleware/validate");
const { loginValidator } = require("../../validators/authValidator");
const { INTERNAL_ROLES } = require("../../constants/roles");
const {
  validateInvite,
  acceptInvite,
} = require("../../controllers/internalUsers/inviteController");

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: false,
    message: "Too many attempts. Please try again later.",
  },
});

// Counts only failed logins, so normal users are never blocked
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: false,
    message: "Too many failed login attempts. Please try again in 15 minutes.",
  },
});

router.post("/login", loginLimiter, loginValidator, validate, loginInternal);

// impersonate vendor
router.post(
  "/impersonate-vendor/:vendorId",
  protect,
  authorize(...INTERNAL_ROLES),
  impersonateVendor,
);

// router.post("/forgot", forgotLimiter, validate, forgotPassword);
// router.post("/reset", resetLimiter, validate, resetPassword);

// invite (public: the admin is not logged in yet)
router.get("/invite/:token", resetLimiter, validateInvite);
router.post("/accept-invite", resetLimiter, acceptInvite);

// Protected
router.get("/profile", protect, authorize(...INTERNAL_ROLES), getProfile);
router.put("/profile", protect, authorize(...INTERNAL_ROLES), updateProfile);
router.put("/change-password", protect, validate, changePassword);

module.exports = router;
