const MINUTES = {
  m15: 15,
  hour: 60,
  day: 24 * 60,
  days3: 3 * 24 * 60,
  days7: 7 * 24 * 60,
  days14: 14 * 24 * 60,
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
