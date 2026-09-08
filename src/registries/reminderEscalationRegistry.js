// Escalation policies for reminder types that must STOP repeating after a
// bounded window and instead trigger a one-time business action (auto-
// cancel + alert a team, in every case we have today) — as opposed to
// reminderCycleRegistry's cycles, which by design repeat their last entry
// forever until something external resolves/cancels them (that's correct
// for INVOICE_UPLOAD_PENDING/KEY_RETURN_PENDING/SA final-invoice checks —
// there is no client-specified cutoff for those).
//
// Kept as its OWN registry rather than folded into reminderCycleRegistry
// because it answers a different question ("should this schedule keep
// existing at all?") from what the cycle table answers ("how long until
// the next fire?"). A reminderType with no entry here just never exhausts
// — existing cycles (VENDOR_DEFAULT, SA_*) are completely unaffected by
// this file's existence.
//
// processors/reminderProcessor.js checks this registry BEFORE firing each
// due reminder. If isExhausted(schedule, now) is true, onExhausted(schedule)
// runs instead of another notification, and the schedule is marked
// "cancelled" so it's never picked up again.

const { businessDaysElapsed } = require("../utils/businessDayMath");

const DAY_MS = 24 * 60 * 60 * 1000;

const ESCALATIONS = {
  // "reminder alerts every 24 hours for 2 business days... after 2
  // business days no response the WO is cancelled from their system and
  // returned to the Repair Clerk with an alert to re-assign."
  WORK_ORDER_ACCEPT_DECLINE_REMINDER: {
    isExhausted: (schedule, now) =>
      businessDaysElapsed(schedule.createdAt, now) >= 2,
    onExhausted: async (schedule) => {
      const {
        expireAcceptDeclineReminder,
      } = require("../services/workOrderReminderService");
      await expireAcceptDeclineReminder(schedule);
    },
  },

  // "every 24 hours if not 'in contact' within 2 days of acceptance...
  // cancel and alert Repair Clerk to reassign if not done within 1 full
  // week of accepting." Plain calendar week — the client did not say
  // "business" for this rule (unlike Accept/Decline above), so this one
  // deliberately uses wall-clock elapsed time, not business days.
  WORK_ORDER_TENANT_CONTACT_REMINDER: {
    isExhausted: (schedule, now) =>
      new Date(now).getTime() - new Date(schedule.createdAt).getTime() >=
      7 * DAY_MS,
    onExhausted: async (schedule) => {
      const {
        expireTenantContactReminder,
      } = require("../services/workOrderReminderService");
      await expireTenantContactReminder(schedule);
    },
  },
};

function getEscalationConfig(reminderType) {
  return ESCALATIONS[reminderType];
}

module.exports = { ESCALATIONS, getEscalationConfig };
