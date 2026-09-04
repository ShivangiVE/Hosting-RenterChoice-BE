function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addWeeks(date, weeks) {
  return addDays(date, weeks * 7);
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Recurring Schedule -> interval used to compute a Service Agreement's next
 * cycle dates.
 *
 * "Bi-Annually" means twice a year — every 6
 * months — NOT once every two years. Do not "fix" this to 24 months.
 */
const RECURRING_SCHEDULE_INTERVALS = {
  Weekly: { unit: "weeks", amount: 1 },
  Monthly: { unit: "months", amount: 1 },
  Quarterly: { unit: "months", amount: 3 },
  "Bi-Annually": { unit: "months", amount: 6 },
  Annually: { unit: "months", amount: 12 },
};

/**
 * Computes the next cycle's startDate/endDate from the CURRENT cycle's
 * dates, preserving the original span (endDate - startDate) and shifting
 * forward by the recurring schedule's interval. Anchored on startDate, per
 * the client: "the recurring schedule would be based around the start
 * date."
 */
function computeNextCycleDates(
  currentStartDate,
  currentEndDate,
  recurringSchedule,
) {
  const interval = RECURRING_SCHEDULE_INTERVALS[recurringSchedule];
  if (!interval) {
    throw new Error(`Unsupported recurringSchedule: ${recurringSchedule}`);
  }

  const spanMs =
    new Date(currentEndDate).getTime() - new Date(currentStartDate).getTime();

  const nextStartDate =
    interval.unit === "weeks"
      ? addWeeks(currentStartDate, interval.amount)
      : addMonths(currentStartDate, interval.amount);

  const nextEndDate = new Date(nextStartDate.getTime() + spanMs);

  return { startDate: nextStartDate, endDate: nextEndDate };
}

/**
 * Approximate day-length of a recurring schedule's interval. Used ONLY to
 * size the auto-creation lead-time cap below — never for actual date math,
 * which computeNextCycleDates already handles with real calendar
 * arithmetic (addWeeks/addMonths, correctly variable month lengths, etc).
 */
function getRecurringIntervalDays(recurringSchedule) {
  const interval = RECURRING_SCHEDULE_INTERVALS[recurringSchedule];
  if (!interval) {
    throw new Error(`Unsupported recurringSchedule: ${recurringSchedule}`);
  }
  return interval.unit === "weeks" ? interval.amount * 7 : interval.amount * 30;
}

function getCycleCreationLeadDays(recurringSchedule) {
  const intervalDays = getRecurringIntervalDays(recurringSchedule);
  return Math.max(1, Math.min(30, intervalDays - 1));
}

module.exports = {
  addDays,
  addWeeks,
  addMonths,
  RECURRING_SCHEDULE_INTERVALS,
  computeNextCycleDates,
  getRecurringIntervalDays,
  getCycleCreationLeadDays,
};
