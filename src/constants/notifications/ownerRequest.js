const { OWNER_REQUEST_REVIEWER_ROLES } = require("../roles");

module.exports = {
  types: {
    OWNER_REQUEST_SUBMITTED: "OWNER_REQUEST_SUBMITTED", // → approvers
    OWNER_REQUEST_REVIEWED: "OWNER_REQUEST_REVIEWED", // → owner
    OWNER_REQUEST_CANCELLED: "OWNER_REQUEST_CANCELLED", // → approver who approved it
  },

  // Sent directly to the building's team approvers (not role-wide),
  // so no `events` entry is needed.
  events: {},

  categories: {
    // Approvers can't switch this off — a missed alert means a stuck request
    OWNER_REQUEST_APPROVALS: {
      key: "OWNER_REQUEST_APPROVALS",
      label: "Owner Request Approvals",
      roles: OWNER_REQUEST_REVIEWER_ROLES,
      mandatory: true,
      types: ["OWNER_REQUEST_SUBMITTED", "OWNER_REQUEST_CANCELLED"],
    },

    // Matches the client's Owner Portal setting "Repair Updates"
    OWNER_REPAIR_UPDATES: {
      key: "OWNER_REPAIR_UPDATES",
      label: "Repair Updates",
      roles: ["Owner"],
      types: ["OWNER_REQUEST_REVIEWED"],
    },
  },
};
