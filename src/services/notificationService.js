const { getIO } = require("../../socket");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { TYPE_TO_CATEGORY } = require("../constants/notifications/registry");
const { getCategoryPreference } = require("./notificationPreferenceService");
const { sendNotificationEmailNow } = require("./notificationEmailService");
const NotificationDigestQueueItem = require("../models/NotificationDigestQueueItem");
const { resolveReminders } = require("./notificationReminderService");
const { sendPushToUser } = require("./pushNotificationService");

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

// Web app route that redirects each role to its own notifications page.
const WEB_NOTIFICATIONS_PATH = "/open-notifications";

const buildWebLink = () => {
  const base = process.env.WEB_APP_URL;
  if (!base || !base.startsWith("https://")) return undefined;
  return `${base.replace(/\/$/, "")}${WEB_NOTIFICATIONS_PATH}`;
};

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
    pushEnabled: true,
    appFrequency: "immediately",
    emailFrequency: "immediately",
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

  // ── In-app (socket) ────────────────────────────────────────────────────────
  if (!notification.hidden) {
    try {
      getIO()
        .to(`user:${user.toString()}`)
        .emit("notification:new", { notification });
    } catch (err) {
      console.warn("[NotificationService] Socket emit skipped:", err.message);
    }
  }

  // ── Push (web + Android + iOS) ─────────────────────────────────────────────
  // Deliberately NOT awaited: an FCM round-trip shouldn't slow down the
  // request that created the notification — e.g. a work order fanned out to
  // a whole vendor pool creates one notification per vendor in a loop.
  // sendPushToUser is a no-op if Firebase isn't configured or the user has
  // no registered devices, and any failure is logged, never thrown.
  // `!== false` so preference docs saved before pushEnabled existed still
  // count as "on".
  if (pref.pushEnabled !== false) {
    sendPushToUser(user, {
      title: notification.title,
      body: notification.message,
      data: {
        notificationId: notification._id,
        type: notification.type,
        entityType: notification.entityType,
        entityId: notification.entityId,
      },
      link: buildWebLink(),
    }).catch((err) =>
      console.warn("[NotificationService] Push delivery skipped:", err.message),
    );
  }

  // ── Email (immediate or digest) ────────────────────────────────────────────
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
          // Was `pref.frequency`, a field that no longer exists on the
          // preference (it was split into appFrequency / emailFrequency),
          // so digest items were being queued with no frequency.
          frequency: pref.emailFrequency,
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
