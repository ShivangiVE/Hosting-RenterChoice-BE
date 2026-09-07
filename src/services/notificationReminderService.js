const NotificationReminderSchedule = require("../models/NotificationReminderSchedule");
const { computeNextFireAt } = require("../registries/reminderCycleRegistry");

/**
 * Schedule a new reminder.
 * Idempotent — silently returns the existing one if already active.
 *
 * CHANGE: idempotency (and therefore "one active reminder") is now scoped
 * to entity + type + RECIPIENT (userId), not just entity + type. This was
 * safe to widen (every existing caller — INVOICE_UPLOAD_PENDING,
 * KEY_RETURN_PENDING, SA cycles — already has exactly one recipient per
 * entity, so adding userId to the match is a no-op for them) and is
 * required for the Vendor Work Order Accept/Decline reminder: a
 * company-pool work order invites several vendors at once, and each one
 * needs their OWN independent reminder on the SAME WorkOrder entityId —
 * the old entity+type-only key would have let only the first invited
 * vendor's reminder ever get created.
 *
 * @param {Object} opts
 * @param {string}   opts.reminderType
 * @param {string}   opts.entityType
 * @param {ObjectId} opts.entityId
 * @param {ObjectId} opts.userId
 * @param {string}   [opts.role]
 * @param {string}   opts.title
 * @param {string}   opts.message
 * @param {string}   [opts.cycleId]
 * @param {Object}   [opts.metadata]
 * @param {Date}     [opts.startAt]   — override for when the FIRST reminder
 *   fires. Defaults to the cycle's normal first-delay (unchanged existing
 *   behavior). Use this for rules with a start delay that isn't part of the
 *   cycle's own spacing — e.g. "starts 3 business days after Completed,
 *   THEN weekly": the weekly spacing belongs in the cycle table, the
 *   3-business-day start delay does not.
 * @returns {Promise<NotificationReminderSchedule>}
 */
async function scheduleReminder(opts) {
  const {
    reminderType,
    entityType,
    entityId,
    userId,
    role,
    title,
    message,
    cycleId = "VENDOR_DEFAULT",
    metadata = {},
    startAt,
  } = opts;

  // Idempotency: one active reminder per entity+type+recipient
  const existing = await NotificationReminderSchedule.findOne({
    reminderType,
    entityId,
    userId,
    status: "active",
  });
  if (existing) return existing;

  return NotificationReminderSchedule.create({
    reminderType,
    entityType,
    entityId,
    userId,
    role,
    cycleId,
    notificationTitle: title,
    notificationMessage: message,
    metadata,
    nextFireAt: startAt ?? computeNextFireAt(0, new Date(), cycleId),
    reminderCount: 0,
  });
}

/**
 * Resolve (stop) all active reminders for a given entity + type.
 * Call when the vendor completes the pending action.
 *
 * @param {ObjectId} entityId
 * @param {string}   reminderType
 * @param {ObjectId} [userId]  — optional: resolve only this recipient's
 *   reminder (needed for company-pool work orders where several vendors
 *   each hold their own active schedule of the same type on the same
 *   entity). Omit to resolve all recipients' reminders of this type, which
 *   matches every pre-existing call site's behavior exactly.
 */
async function resolveReminders(entityId, reminderType, userId) {
  const match = { entityId, reminderType, status: "active" };
  if (userId) match.userId = userId;
  await NotificationReminderSchedule.updateMany(match, {
    $set: { status: "resolved" },
  });
}

/**
 * Cancel ALL active reminders for an entity.
 * Call on delete / hard-close.
 */
async function cancelAllReminders(entityId) {
  await NotificationReminderSchedule.updateMany(
    { entityId, status: { $in: ["active", "paused"] } },
    { $set: { status: "cancelled" } },
  );
}

/**
 * Pause reminders for a set duration (e.g. vendor requests extension).
 * They resume automatically when pausedUntil passes.
 *
 * @param {ObjectId} entityId
 * @param {string}   reminderType
 * @param {number}   pauseMinutes
 */
async function pauseReminders(entityId, reminderType, pauseMinutes) {
  const pausedUntil = new Date(Date.now() + pauseMinutes * 60 * 1000);
  await NotificationReminderSchedule.updateMany(
    { entityId, reminderType, status: "active" },
    { $set: { status: "paused", pausedUntil } },
  );
}

module.exports = {
  scheduleReminder,
  resolveReminders,
  cancelAllReminders,
  pauseReminders,
};
