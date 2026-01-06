const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/authMiddleware"); // You’ll create this
const {
  register,
  login,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyOtp,
  uploadProfileImage,
} = require("../../controllers/externlusers/authController");
const {
  registerValidator,
  loginValidator,
} = require("../../validators/authValidator");
const validate = require("../../middleware/validate");
const profileUpload = require("../../middleware/profileUpload");

// Public
router.post("/register", registerValidator, validate, register);
router.post("/login", loginValidator, validate, login);

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
  uploadProfileImage
);
router.put("/change-password", protect, changePassword);

module.exports = router;
