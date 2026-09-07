const NotificationReminderSchedule = require("../models/NotificationReminderSchedule");
const { isStillPending } = require("../registries/reminderResolverRegistry");
const { computeNextFireAt } = require("../registries/reminderCycleRegistry");
const {
  getEscalationConfig,
} = require("../registries/reminderEscalationRegistry");

const { createNotification } = require("../services/notificationService");
const { registerJob } = require("../jobs/registry");

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
  const escalation = getEscalationConfig(reminder.reminderType);
  if (escalation && escalation.isExhausted(reminder, now)) {
    try {
      await escalation.onExhausted(reminder);
    } catch (err) {
      console.error(
        `[ReminderProcessor] onExhausted failed for ${reminder.reminderType} (${reminder._id}):`,
        err.message,
      );

      return;
    }
    await NotificationReminderSchedule.findByIdAndUpdate(reminder._id, {
      $set: { status: "cancelled" },
    });
    return;
  }

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
  await createNotification({
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

registerJob({
  name: "processReminders",
  cronExpression: "* * * * *",
  task: processReminders,
});
