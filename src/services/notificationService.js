const { getIO } = require("../../socket");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { TYPE_TO_CATEGORY } = require("../constants/notifications/registry");
const { getCategoryPreference } = require("./notificationPreferenceService");
const { sendNotificationEmailNow } = require("./notificationEmailService");
const NotificationDigestQueueItem = require("../models/NotificationDigestQueueItem");
const { resolveReminders } = require("./notificationReminderService");

const DEDUP_WINDOW_MS = 60 * 1000;

const REMINDER_TYPES = [
  "INVOICE_UPLOAD_PENDING",
  "KEY_RETURN_PENDING",
  "INSPECTION_REPORT_PENDING",
  "LEASE_EXPIRY_NOTICE",
  "TASK_OVERDUE",
  "SERVICE_AGREEMENT_NEW_CYCLE_CREATED",
  "SERVICE_AGREEMENT_FINAL_INVOICE_CHECK",
  "WORK_ORDER_ACCEPT_DECLINE_REMINDER",
  "WORK_ORDER_TENANT_CONTACT_REMINDER",
];

exports.createNotification = async ({
  user,
  role,
  type,
  title,
  message,
  entityType,
  entityId,
  metadata = {},
}) => {
  if (REMINDER_TYPES.includes(type)) {
    const recentCutoff = new Date(Date.now() - DEDUP_WINDOW_MS);
    const duplicate = await Notification.findOne({
      user,
      type,
      entityId,
      createdAt: { $gte: recentCutoff },
      deletedAt: null,
    });
    if (duplicate) return duplicate;
  }

  const categoryKey = TYPE_TO_CATEGORY[type];
  let pref = {
    emailEnabled: false,
    inAppEnabled: true,
    frequency: "immediately",
  };
  if (categoryKey) {
    pref = await getCategoryPreference(user, categoryKey);
  }

  let notification;
  try {
    notification = await Notification.create({
      user,
      role,
      type,
      title,
      message,
      entityType,
      entityId,
      metadata,
      hidden: !pref.inAppEnabled,
    });
  } catch (err) {
    console.error("[createNotification] Failed to persist notification:", {
      error: err.message,
      user: user?.toString(),
      type,
      entityType,
      entityId: entityId?.toString(),
    });
    throw err;
  }

  if (!notification.hidden) {
    try {
      getIO()
        .to(`user:${user.toString()}`)
        .emit("notification:new", { notification });
    } catch (err) {
      console.warn("[NotificationService] Socket emit skipped:", err.message);
    }
  }

  if (pref.emailEnabled) {
    try {
      if (pref.emailFrequency === "immediately") {
        const recipientUser = await User.findById(user).select(
          "email preferredName firstName",
        );
        if (recipientUser)
          await sendNotificationEmailNow(recipientUser, notification);
      } else {
        await NotificationDigestQueueItem.create({
          user,
          categoryKey,
          frequency: pref.frequency,
          title: notification.title,
          message: notification.message,
        });
      }
    } catch (err) {
      console.warn(
        "[NotificationService] Email/digest delivery skipped:",
        err.message,
      );
    }
  }

  return notification;
};

/**
 * @param {ObjectId|string} entityId
 * @param {string|string[]} types
 * @param {Object} [opts]
 * @param {ObjectId|string} [opts.userId]
 */
exports.resolveNotificationsForEntity = async (entityId, types, opts = {}) => {
  const typeList = Array.isArray(types) ? types : [types];
  const { userId } = opts;

  const match = { entityId, type: { $in: typeList }, actionTakenAt: null };
  if (userId) match.user = userId;

  await Notification.updateMany(match, {
    $set: { actionTakenAt: new Date(), readAt: new Date() },
  });

  await Promise.all(
    typeList.map((type) => resolveReminders(entityId, type, userId)),
  );
};
