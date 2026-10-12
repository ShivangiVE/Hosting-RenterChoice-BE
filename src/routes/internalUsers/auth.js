const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../../middleware/authMiddleware");
const {
  loginInternal,
  forgotPassword,
  resetPassword,
  updateProfile,
  changePassword,
  impersonateVendor,
  getProfile,
} = require("../../controllers/internalUsers/authController");
const validate = require("../../middleware/validate");
const { loginValidator } = require("../../validators/authValidator");
const { INTERNAL_ROLES } = require("../../constants/roles");

router.post("/login", loginValidator, validate, loginInternal);

// impersonate vendor
router.post(
  "/impersonate-vendor/:vendorId",
  protect,
  authorize(...INTERNAL_ROLES),
  impersonateVendor,
);

router.post("/forgot", validate, forgotPassword);
router.post("/reset", validate, resetPassword);

// Protected
router.get("/profile", protect, authorize(...INTERNAL_ROLES), getProfile);
router.put("/profile", protect, updateProfile);
router.put("/change-password", protect, validate, changePassword);

module.exports = router;
