const MINUTES = {
  m15: 15,
  hour: 60,
  day: 24 * 60,
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
