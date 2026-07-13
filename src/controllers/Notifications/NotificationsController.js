const Notification = require("../../models/Notification");
const { sendSuccess } = require("../../utils/response");

// GET notifications
exports.getNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = {
      user: req.user._id,
      deletedAt: null,
      actionTakenAt: null,
    };

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),

      Notification.countDocuments(filter),

      Notification.countDocuments({
        ...filter,
        readAt: null,
      }),
    ]);

    return sendSuccess(res, "Notifications fetched", {
      notifications,
      unreadCount,

      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// MARK single notification read
exports.markNotificationRead = async (req, res) => {
  await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { readAt: new Date() },
  );

  return sendSuccess(res, "Notification marked as read");
};

// MARK all notifications read
exports.markAllNotificationsRead = async (req, res) => {
  await Notification.updateMany(
    { user: req.user._id, readAt: null },
    { $set: { readAt: new Date() } },
  );

  return sendSuccess(res, "All notifications marked as read");
};

// MARK single notification action taken
exports.markNotificationActionTaken = async (req, res) => {
  await Notification.findOneAndUpdate(
    {
      _id: req.params.id,
      user: req.user._id,
      actionTakenAt: null,
    },
    {
      $set: {
        readAt: new Date(),
        actionTakenAt: new Date(),
      },
    },
  );
  return sendSuccess(res, "Notification action handled");
};

// DeLETE single notification (soft delete)
exports.deleteNotification = async (req, res) => {
  const deleted = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: { deletedAt: new Date() } },
    { new: true },
  );

  if (!deleted) {
    return res.status(404).json({
      success: false,
      message: "Notification not found",
    });
  }

  return sendSuccess(res, "Notification deleted");
};
