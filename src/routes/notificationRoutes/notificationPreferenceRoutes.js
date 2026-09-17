const express = require("express");
const { protect } = require("../../middleware/authMiddleware");
const {
  getCategories,
  getFrequencyOptions,
  getMyPreferences,
  updateMyPreferences,
  getSnoozeOptions,
  getMySnoozeSettings,
  updateMySnoozeSettings,
} = require("../../controllers/Notifications/NotificationPreferenceController");

const router = express.Router();

router.get("/categories", protect, getCategories);
router.get("/frequency-options", protect, getFrequencyOptions);
router.get("/", protect, getMyPreferences);
router.get("/snooze-options", protect, getSnoozeOptions);
router.get("/snooze-settings", protect, getMySnoozeSettings);
router.put("/", protect, updateMyPreferences);
router.put("/snooze-settings", protect, updateMySnoozeSettings);

module.exports = router;
