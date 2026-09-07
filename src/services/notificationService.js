const { getIO } = require("../../socket");
const Notification = require("../models/Notification");

const DEDUP_WINDOW_MS = 60 * 1000;

const REMINDER_TYPES = [
  "INVOICE_UPLOAD_PENDING",
  "KEY_RETURN_PENDING",
  "INSPECTION_REPORT_PENDING",
  "LEASE_EXPIRY_NOTICE",
  "TASK_OVERDUE",
  // Service Agreement recurring-cycle notifications — added so repeated
  // sweep ticks within the same minute (or a re-run) can't double-fire.
  "SERVICE_AGREEMENT_NEW_CYCLE_CREATED",
  "SERVICE_AGREEMENT_FINAL_INVOICE_CHECK",
  // Vendor Work Order lifecycle — the two new single-recipient reminder
  // cascades driven through the generic engine (Accept/Decline,
  // tenant-contact). Same reasoning as above.
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
  // ── Dedup guard (reminder types only) ────────────────────────────────────
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

  // ── Persist ───────────────────────────────────────────────────────────────
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
    });
  } catch (err) {
    // Expose validation errors (e.g. type not in enum, missing required field)
    console.error("[createNotification] Failed to persist notification:", {
      error: err.message,
      user: user?.toString(),
      type,
      entityType,
      entityId: entityId?.toString(),
    });
    throw err;
  }

  // ── Deliver via socket ────────────────────────────────────────────────────
  try {
    getIO()
      .to(`user:${user.toString()}`)
      .emit("notification:new", { notification });
  } catch (err) {
    console.warn("[NotificationService] Socket emit skipped:", err.message);
  }

  return notification;
};
