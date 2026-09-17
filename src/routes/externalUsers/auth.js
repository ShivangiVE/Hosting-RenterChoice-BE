const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const { protect } = require("../../middleware/authMiddleware");
const {
  register,
  login,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyOtp,
  uploadProfileImage,
  verifyCompanyAccount,
  notifyTeamAdminOfDeactivatedPortfolio,
} = require("../../controllers/externlusers/authController");
const {
  registerValidator,
  loginValidator,
} = require("../../validators/authValidator");
const validate = require("../../middleware/validate");
const profileUpload = require("../../middleware/profileUpload");

// Public
router.post("/register", registerValidator, validate, register);
router.get("/verify-account/:accountNumber", verifyCompanyAccount);
router.post("/login", loginValidator, validate, login);

// Mobile-specific login alias ──
router.post(
  "/login/mobile",
  (req, res, next) => {
    req.body.platform = "mobile";
    next();
  },
  loginValidator,
  validate,
  login,
);

// Portfolio deactivation notice — public (owner isn't logged in when
// they hit this), so it's rate-limited: 5 requests per IP per 15 min.
const notifyAdminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: false,
    message: "Too many requests. Please try again later.",
  },
});
router.post(
  "/portfolio-deactivated/notify",
  notifyAdminLimiter,
  notifyTeamAdminOfDeactivatedPortfolio,
);

// Forgot / Reset
router.post("/forgot", forgotPassword);
router.post("/verify-otp", verifyOtp);
router.post("/reset", resetPassword);

// Protected routes
router.put("/profile", protect, updateProfile);
router.post(
  "/profile/avatar",
  protect,
  profileUpload.single("avatar"),
  uploadProfileImage,
);
router.put("/change-password", protect, changePassword);

module.exports = router;
