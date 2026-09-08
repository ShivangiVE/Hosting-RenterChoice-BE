// Business-day-aware date math. Deliberately separate from utils/dateMath.js
// (calendar-only) — the Vendor Work Order requirements explicitly call out
// "business days" for two rules (Accept/Decline cascade, invoice reminder
// start delay) while every other rule in the same document is stated in
// plain calendar days/weeks. Mixing the two into one flat-minutes table
// (the way reminderCycleRegistry works today) would silently shorten the
// Accept/Decline window for any work order assigned on a Thu/Fri, and would
// fire reminders on weekends the client never asked for — a real
// correctness bug, not a style nitpick.
//
// NOTE: weekends only (Mon–Fri = business). No public-holiday calendar yet.
// If the client needs holidays excluded too, add a HOLIDAYS date list here
// and check it in isBusinessDay — every function below already funnels
// through it, so that would be a one-place change.

function isBusinessDay(date) {
  const day = new Date(date).getDay();
  return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Adds N business days to a date. N may be fractional-free only (integers).
 * addBusinessDays(fridayNoon, 2) -> the following Tuesday, same time-of-day.
 */
function addBusinessDays(date, n) {
  const result = new Date(date);
  let remaining = n;
  const step = remaining < 0 ? -1 : 1;
  remaining = Math.abs(remaining);

  while (remaining > 0) {
    result.setDate(result.getDate() + step);
    if (isBusinessDay(result)) remaining -= 1;
  }
  return result;
}

/**
 * Counts full business days elapsed between two dates (from -> to).
 * Used to check "has N business days passed since X" without caring about
 * exact fire schedule — e.g. cascade exhaustion checks.
 */
function businessDaysElapsed(from, to = new Date()) {
  const start = new Date(from);
  const end = new Date(to);
  if (end <= start) return 0;

  let count = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);

  while (cursor < endDay) {
    cursor.setDate(cursor.getDate() + 1);
    if (isBusinessDay(cursor)) count += 1;
  }
  return count;
}

module.exports = { isBusinessDay, addBusinessDays, businessDaysElapsed };
