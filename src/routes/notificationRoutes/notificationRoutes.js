const express = require("express");
const { protect } = require("../../middleware/authMiddleware");
const { getNotifications, markNotificationRead, markAllNotificationsRead } = require("../../controllers/Notifications/NotificationsController");

const router = express.Router();

// Get notifications (with pagination + unread count)
router.get("/", protect, getNotifications);

// Mark single notification as read
router.put("/:id/read", protect, markNotificationRead);

// Mark all notifications as read
router.put("/read-all", protect, markAllNotificationsRead);

module.exports = router;
