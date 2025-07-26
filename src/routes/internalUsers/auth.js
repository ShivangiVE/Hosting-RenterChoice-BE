const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/authMiddleware");
const {
  loginInternal,
  forgotPassword,
  resetPassword,
  updateProfile,
  changePassword,
} = require("../../controllers/internalUsers/authController");
const validate = require("../../middleware/validate");
const { loginValidator } = require("../../validators/authValidator");

// Public
router.post("/login", loginValidator, validate, loginInternal);
router.post("/forgot", validate, forgotPassword);
router.post("/reset", validate, resetPassword);

// Protected
router.put("/profile", protect, updateProfile);
router.put("/change-password", protect, validate, changePassword);

module.exports = router;
