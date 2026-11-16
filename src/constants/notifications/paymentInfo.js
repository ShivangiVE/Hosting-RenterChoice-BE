const { PAYMENT_INFO_REVIEWER_ROLES } = require("../roles");

module.exports = {
  types: {
    PAYMENT_INFO_CHANGE_REQUESTED: "PAYMENT_INFO_CHANGE_REQUESTED", // → approvers
    PAYMENT_INFO_CHANGE_REVIEWED: "PAYMENT_INFO_CHANGE_REVIEWED", // → vendor
  },

  // Sent directly to the approvers / the vendor, so no `events` entry is needed
  events: {},

  categories: {
    // Banking changes must never be missed
    PAYMENT_INFO_APPROVALS: {
      key: "PAYMENT_INFO_APPROVALS",
      label: "Payment Info Approvals",
      roles: PAYMENT_INFO_REVIEWER_ROLES,
      mandatory: true,
      types: ["PAYMENT_INFO_CHANGE_REQUESTED"],
    },

    VENDOR_PAYMENT_INFO_UPDATES: {
      key: "VENDOR_PAYMENT_INFO_UPDATES",
      label: "Payment Info Updates",
      roles: ["Vendor"],
      mandatory: true,
      types: ["PAYMENT_INFO_CHANGE_REVIEWED"],
    },
  },
};
