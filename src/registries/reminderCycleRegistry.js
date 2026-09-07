const MINUTES = {
  m15: 15,
  hour: 60,
  day: 24 * 60,
  days2: 2 * 24 * 60,
  days3: 3 * 24 * 60,
  days7: 7 * 24 * 60,
  days14: 14 * 24 * 60,
  days16: 16 * 24 * 60,
  days30: 30 * 24 * 60,
};

/**
 * Each cycle is an ordered array of delays (in minutes).
 * Index = reminderCount already sent.
 * If reminderCount exceeds the array length, the LAST element repeats forever.
 *
 * To add a new cycle: drop a new key here. Nothing else needs to change.
 *
 * IMPORTANT: this table only controls the SPACING between reminders once a
 * schedule is active. It has no concept of "stop after N reminders and do
 * something else" — that's a separate, deliberate concern handled by
 * registries/reminderEscalationRegistry.js (see that file's header comment
 * for why it's kept separate). Likewise it has no concept of "skip
 * weekends" — cycles here fire on flat calendar delays. Where a rule is
 * genuinely business-day-bound (Accept/Decline cascade, invoice reminder
 * start delay), that's handled with utils/businessDayMath.js at the call
 * site / in the escalation registry, not by trying to encode "business
 * days" into this minutes table.
 */
const CYCLES = {
  // Vendor: invoice / key return after work order completion
  VENDOR_DEFAULT: [
    MINUTES.day, // reminder 1 → 1 day later
    MINUTES.days7, // reminder 2 → 7 days later
    MINUTES.days3, // reminder 3 → 3 days later
    MINUTES.days3, // reminder 4 → 3 days later
    MINUTES.days3, // reminder 5 → 3 days later
    // reminder 6+ → 1 day (repeating last entry)
    MINUTES.day,
  ],

  // Service Agreement: escalating "still needs assignment" alert for an
  // auto-created recurring cycle. Alert #1 fires at creation time — T-30
  // days before the new cycle's start date (handled directly in
  // serviceAgreementCycleService.createNextCycle). This table governs the
  // follow-ups consumed by serviceAgreementCycleProcessor:
  //   T-30d (already fired) -> T-14d -> T-7d -> daily through T-0 (and
  //   beyond, since the last entry repeats, until someone routes it).
  SA_NEW_CYCLE_ALERT: [
    MINUTES.days16, // 30d -> 14d before start
    MINUTES.days7, // 14d -> 7d before start
    MINUTES.day, // 7d -> daily for the final week (repeats)
  ],

  // Service Agreement: insistent reminder once a cycle's end date has
  // passed with zero invoices ever submitted for it. Mirrors
  // VENDOR_DEFAULT's cadence intentionally — same "how urgent is this"
  // shape, different concern.
  SA_FINAL_INVOICE_PENDING: [
    MINUTES.day,
    MINUTES.days7,
    MINUTES.days3,
    MINUTES.days3,
    MINUTES.days3,
    MINUTES.day,
  ],

  // ── Vendor Work Order lifecycle  ───────────────────
  // Accept/Decline: "reminder alerts every 24 hours for 2 business days".
  // The 24h spacing lives here; the 2-BUSINESS-day cutoff (which can span a
  // weekend and therefore isn't a fixed reminderCount) lives in
  // reminderEscalationRegistry.WORK_ORDER_ACCEPT_DECLINE_REMINDER. This
  // array just needs enough entries that a reminder is always due before
  // the escalation registry decides the schedule is exhausted; the last
  // entry repeating harmlessly covers any edge case.
  WO_ACCEPT_DECLINE: [MINUTES.day],

  // Post-acceptance tenant contact: "reminder alert every 24 hours" until
  // done or until 1 full week has passed (exhaustion — see
  // reminderEscalationRegistry.WORK_ORDER_TENANT_CONTACT_REMINDER).
  WO_TENANT_CONTACT: [MINUTES.day],

  // Completed-but-no-invoice, vendor-facing leg: starts 3 BUSINESS days
  // after "Completed" (the start delay is applied once, at scheduling time,
  // via scheduleReminder's `startAt` override — see
  // services/workOrderReminderService.js) then repeats weekly forever,
  // resolved only when the vendor uploads the invoice. The separate
  // Accounts Clerk "phone the vendor" alert at the 3-week mark is a
  // team-wide broadcast, not a single-recipient reminder, so it does NOT
  WO_INVOICE_VENDOR_WEEKLY: [MINUTES.days7],
};

/**
 * @param {number} reminderCount  — reminders already sent (0-indexed)
 * @param {string} cycleId        — key from CYCLES
 * @returns {number}              — delay in minutes until next reminder
 */
function getNextDelay(reminderCount, cycleId = "VENDOR_DEFAULT") {
  const cycle = CYCLES[cycleId] ?? CYCLES.VENDOR_DEFAULT;
  // Cap at last entry — last entry repeats indefinitely
  const index = Math.min(reminderCount, cycle.length - 1);
  return cycle[index];
}

/**
 * @param {number} reminderCount
 * @param {Date}   [from]        — base date, defaults to now
 * @param {string} [cycleId]
 * @returns {Date}
 */
function computeNextFireAt(reminderCount, from = new Date(), cycleId) {
  const delayMs = getNextDelay(reminderCount, cycleId) * 60 * 1000;
  return new Date(from.getTime() + delayMs);
}

module.exports = { CYCLES, getNextDelay, computeNextFireAt };
