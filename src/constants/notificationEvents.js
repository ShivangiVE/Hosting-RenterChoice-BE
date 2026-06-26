const NOTIFICATION_EVENTS = {
  WORK_ORDER_COMPLETED: {
    roles: ["Admin", "OfficeAdmin", "RepairsTeam"],
  },

  INVOICE_UPLOADED: {
    roles: ["Admin", "OfficeAdmin", "AccountsTeam"],
  },

  KEY_RETURNED: {
    roles: ["Admin", "OfficeAdmin", "RepairsTeam"],
  },
};

module.exports = NOTIFICATION_EVENTS;
