const NotificationReminderSchedule = require("../models/NotificationReminderSchedule");
const { computeNextFireAt } = require("../registries/reminderCycleRegistry");

/**
 * Schedule a new reminder.
 * Idempotent — silently returns the existing one if already active.
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
  } = opts;

  // Idempotency: one active reminder per entity+type
  const existing = await NotificationReminderSchedule.findOne({
    reminderType,
    entityId,
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
    nextFireAt: computeNextFireAt(0, new Date(), cycleId),
    reminderCount: 0,
  });
}

/**
 * Resolve (stop) all active reminders for a given entity + type.
 * Call when the vendor completes the pending action.
 */
async function resolveReminders(entityId, reminderType) {
  await NotificationReminderSchedule.updateMany(
    { entityId, reminderType, status: "active" },
    { $set: { status: "resolved" } },
  );
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
