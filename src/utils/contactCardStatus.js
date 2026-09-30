const STATUS_FILTERS = Object.freeze({
  ALL: "All",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
});

/**
 * Turns the ?status query param into a Mongo filter fragment on isActive.
 * No param, or anything unrecognised, defaults to Active only — the filter
 * fails closed so deactivated records are never shown by accident.
 */
function buildStatusFilter(status) {
  if (status === STATUS_FILTERS.ALL) return {};
  if (status === STATUS_FILTERS.INACTIVE) return { isActive: false };
  return { isActive: true };
}

/** Display label derived from the single source of truth. */
const toStatusLabel = (isActive) =>
  isActive ? STATUS_FILTERS.ACTIVE : STATUS_FILTERS.INACTIVE;

module.exports = { STATUS_FILTERS, buildStatusFilter, toStatusLabel };
