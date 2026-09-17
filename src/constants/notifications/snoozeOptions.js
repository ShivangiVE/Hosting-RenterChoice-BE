const SNOOZE_OPTIONS = [
  { value: "15m", label: "15 minutes", ms: 15 * 60 * 1000 },
  { value: "30m", label: "30 minutes", ms: 30 * 60 * 1000 },
  { value: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
  { value: "2h", label: "2 hours", ms: 2 * 60 * 60 * 1000 },
  { value: "5h", label: "5 hours", ms: 5 * 60 * 60 * 1000 },
  { value: "8h", label: "8 hours", ms: 8 * 60 * 60 * 1000 },
  { value: "tomorrow", label: "Tomorrow (same time)", ms: 24 * 60 * 60 * 1000 },
];

const SNOOZE_DURATION_VALUES = SNOOZE_OPTIONS.map((opt) => opt.value);
const DEFAULT_SNOOZE_DURATION = "2h";

module.exports = {
  SNOOZE_OPTIONS,
  SNOOZE_DURATION_VALUES,
  DEFAULT_SNOOZE_DURATION,
};
