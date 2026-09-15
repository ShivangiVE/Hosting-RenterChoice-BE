const express = require("express");
const { protect } = require("../../middleware/authMiddleware");
const {
  getCategories,
  getFrequencyOptions,
  getMyPreferences,
  updateMyPreferences,
} = require("../../controllers/Notifications/NotificationPreferenceController");

const router = express.Router();

router.get("/categories", protect, getCategories);
router.get("/frequency-options", protect, getFrequencyOptions);
router.get("/", protect, getMyPreferences);
router.put("/", protect, updateMyPreferences);

module.exports = router;
