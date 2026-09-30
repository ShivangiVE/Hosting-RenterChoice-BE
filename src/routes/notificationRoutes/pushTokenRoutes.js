const express = require("express");
const { protect } = require("../../middleware/authMiddleware");
const {
  registerPushToken,
  unregisterPushToken,
} = require("../../controllers/Notifications/PushTokenController");

const router = express.Router();

// Register / refresh this device's push token for the logged-in user
router.post("/register", protect, registerPushToken);

// Remove this device's push token (call on logout)
router.post("/unregister", protect, unregisterPushToken);

module.exports = router;
