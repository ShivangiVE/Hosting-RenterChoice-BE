module.exports = {
  types: {
    WORK_ORDER_ACCEPT_DECLINE_REMINDER: "WORK_ORDER_ACCEPT_DECLINE_REMINDER",
    WORK_ORDER_ACCEPT_DECLINE_EXPIRED: "WORK_ORDER_ACCEPT_DECLINE_EXPIRED",
    WORK_ORDER_TENANT_CONTACT_REMINDER: "WORK_ORDER_TENANT_CONTACT_REMINDER",
    WORK_ORDER_TENANT_CONTACT_EXPIRED: "WORK_ORDER_TENANT_CONTACT_EXPIRED",
    WORK_ORDER_ATTACHMENT_UPLOADED: "WORK_ORDER_ATTACHMENT_UPLOADED",
    WORK_ORDER_STATUS_CHANGED: "WORK_ORDER_STATUS_CHANGED",
    WORK_ORDER_FOLLOW_UP_REQUIRED: "WORK_ORDER_FOLLOW_UP_REQUIRED",
    WORK_ORDER_RETURN_VISIT_ALERT: "WORK_ORDER_RETURN_VISIT_ALERT",
    WORK_ORDER_INVOICE_ACCOUNTS_ESCALATION:
      "WORK_ORDER_INVOICE_ACCOUNTS_ESCALATION",
  },
  events: {
    WORK_ORDER_ACCEPT_DECLINE_EXPIRED: {
      roles: ["Admin", "OfficeAdmin", "RepairsTeam"],
    },
    WORK_ORDER_TENANT_CONTACT_EXPIRED: {
      roles: ["Admin", "OfficeAdmin", "RepairsTeam"],
    },
    WORK_ORDER_ATTACHMENT_UPLOADED: {
      roles: ["Admin", "OfficeAdmin", "RepairsTeam"],
    },
    WORK_ORDER_STATUS_CHANGED: {
      roles: ["Admin", "OfficeAdmin", "RepairsTeam"],
    },
    WORK_ORDER_FOLLOW_UP_REQUIRED: {
      roles: ["Admin", "OfficeAdmin", "RepairsTeam"],
    },
    WORK_ORDER_RETURN_VISIT_ALERT: {
      roles: ["Admin", "OfficeAdmin", "RepairsTeam"],
    },
    WORK_ORDER_INVOICE_ACCOUNTS_ESCALATION: {
      roles: ["Admin", "OfficeAdmin", "AccountsTeam"],
    },
  },
  categories: {
    WORK_ORDER_UPDATES: {
      key: "WORK_ORDER_UPDATES",
      label: "Work Order Updates",
      roles: ["Vendor"],
      types: [
        "WORK_ORDER_ASSIGNED",
        "WORK_ORDER_ACCEPTED",
        "WORK_ORDER_DECLINED",
        "WORK_ORDER_ACCEPT_DECLINE_REMINDER",
        "WORK_ORDER_ACCEPT_DECLINE_EXPIRED",
        "WORK_ORDER_TENANT_CONTACT_REMINDER",
        "WORK_ORDER_TENANT_CONTACT_EXPIRED",
        "DUE_DATE_EXTENSION_REVIEWED",
      ],
    },
    INVOICE_UPDATES: {
      key: "INVOICE_UPDATES",
      label: "Invoice Updates",
      roles: ["Vendor"],
      types: ["INVOICE_UPLOAD_PENDING"],
    },
  },
};
