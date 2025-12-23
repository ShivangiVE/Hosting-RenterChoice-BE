const Notification = require("../../models/Notification");
const { sendSuccess } = require("../../utils/response");

// GET notifications
exports.getNotifications = async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const notifications = await Notification.find({
    user: req.user._id,
    readAt: null,
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const unreadCount = await Notification.countDocuments({
    user: req.user._id,
    readAt: null,
  });

  return sendSuccess(res, "Notifications fetched", {
    notifications,
    unreadCount,
  });
};

// MARK single notification read
exports.markNotificationRead = async (req, res) => {
  await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { readAt: new Date() }
  );

  return sendSuccess(res, "Notification marked as read");
};

// MARK all notifications read
exports.markAllNotificationsRead = async (req, res) => {
  await Notification.updateMany(
    { user: req.user._id, readAt: null },
    { $set: { readAt: new Date() } }
  );

  return sendSuccess(res, "All notifications marked as read");
};
