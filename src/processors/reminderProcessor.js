const NotificationReminderSchedule = require("../models/NotificationReminderSchedule");
const { isStillPending } = require("../registries/reminderResolverRegistry");
const { computeNextFireAt } = require("../registries/reminderCycleRegistry");
const { notify } = require("../routes/accountsRoutes/coaRoutes");

const BATCH_SIZE = 100; // process at most N reminders per tick

async function processReminders() {
  const now = new Date();

  // ── Step 1: Reactivate any paused reminders whose pausedUntil has passed ──
  await NotificationReminderSchedule.updateMany(
    { status: "paused", pausedUntil: { $lte: now } },
    { $set: { status: "active", pausedUntil: null } },
  );

  // ── Step 2: Fetch due active reminders ────────────────────────────────────
  const due = await NotificationReminderSchedule.find({
    status: "active",
    nextFireAt: { $lte: now },
  })
    .limit(BATCH_SIZE)
    .lean();

  if (due.length === 0) return;

  // Process concurrently but cap parallelism to avoid DB flooding
  await Promise.allSettled(due.map((r) => processOne(r, now)));
}

async function processOne(reminder, now) {
  // ── Check: is the action still pending? ───────────────────────────────────
  const stillPending = await isStillPending(
    reminder.reminderType,
    reminder.entityId,
  );

  if (!stillPending) {
    await NotificationReminderSchedule.findByIdAndUpdate(reminder._id, {
      $set: { status: "resolved" },
    });
    return;
  }

  // ── Fire the notification ─────────────────────────────────────────────────
  await notify({
    user: reminder.userId,
    role: reminder.role,
    type: reminder.reminderType,
    title: reminder.notificationTitle,
    message: reminder.notificationMessage,
    entityType: reminder.entityType,
    entityId: reminder.entityId,
    metadata: {
      ...reminder.metadata,
      reminderNumber: reminder.reminderCount + 1,
    },
  });

  // ── Reschedule ────────────────────────────────────────────────────────────
  const newCount = reminder.reminderCount + 1;
  const nextFireAt = computeNextFireAt(newCount, now, reminder.cycleId);

  await NotificationReminderSchedule.findByIdAndUpdate(reminder._id, {
    $set: {
      reminderCount: newCount,
      lastFiredAt: now,
      nextFireAt,
    },
  });
}

module.exports = { processReminders };
