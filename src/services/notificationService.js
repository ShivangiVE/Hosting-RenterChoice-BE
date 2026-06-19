const { getIO } = require("../../socket");
const Notification = require("../models/Notification");

// ── Dedup window ─────────────────────────────────────────────────────────────
// Prevents double-fire if cron overlaps or a module calls notify() twice fast.
// 60 seconds is safe — your cron runs every 1 min, so two ticks can't both
// fire the same reminder within this window.
const DEDUP_WINDOW_MS = 60 * 1000;

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
  // ── Dedup guard ─────────────────────────────────────────────────────────────
  // Only applies to reminder-driven types, not one-shot events like
  // WORK_ORDER_ASSIGNED (those are unique by nature and won't hit this).
  const REMINDER_TYPES = [
    "INVOICE_UPLOAD_PENDING",
    "KEY_RETURN_PENDING",
    "INSPECTION_REPORT_PENDING",
    "LEASE_EXPIRY_NOTICE",
    "TASK_OVERDUE",
    // add future reminder types here
  ];

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

  // ── Persist ──────────────────────────────────────────────────────────────────
  const notification = await Notification.create({
    user,
    role,
    type,
    title,
    message,
    entityType,
    entityId,
    metadata,
  });

  // ── Deliver: Socket (live) ───────────────────────────────────────────────────
  try {
    getIO()
      .to(`user:${user.toString()}`)
      .emit("notification:new", { notification });
  } catch (err) {
    // Socket not yet initialized (tests, seeder scripts, etc.) — non-fatal.
    // The notification is already persisted; user sees it on next page load.
    console.warn("[NotificationService] Socket emit skipped:", err.message);
  }

  return notification;
};
