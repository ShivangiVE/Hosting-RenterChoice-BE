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
  WORK_ORDER_ALL_VENDORS_DECLINED: {
    roles: ["Admin", "OfficeAdmin"],
  },

  SERVICE_AGREEMENT_ALL_VENDORS_DECLINED: {
    roles: ["Admin", "OfficeAdmin"],
  },

  DUE_DATE_EXTENSION_REQUESTED: {
    roles: ["Admin", "OfficeAdmin", "RepairsTeam"],
  },
  SERVICE_AGREEMENT_NEW_CYCLE_CREATED: {
    roles: ["Admin", "OfficeAdmin", "RepairsTeam"],
  },

  SERVICE_AGREEMENT_FINAL_INVOICE_CHECK: {
    roles: ["Admin", "OfficeAdmin", "AccountsTeam"],
  },
};

module.exports = NOTIFICATION_EVENTS;
