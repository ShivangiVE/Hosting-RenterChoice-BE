const TEAM_ROLES = [
  "AccountsTeam",
  "RepairsTeam",
  "LeaseTeam",
  "MarketingTeam",
  "LandlordsTeam",
  "InspectionClerk",
];

const BROKERAGE_ROLES = [
  "BrokerageAdmin",
  "BrokerageAccounts",
  "BrokerageUser",
];

const BROKERAGE_STAFF_ROLES = BROKERAGE_ROLES.filter(
  (role) => role !== "BrokerageAdmin",
);

const INTERNAL_ROLES = [
  "Admin",
  ...BROKERAGE_ROLES,
  "OfficeAdmin",
  ...TEAM_ROLES,
];

const ACCOUNTS_ROLES = [
  "Admin",
  "BrokerageAdmin",
  "BrokerageAccounts",
  "BrokerageUser",
  "OfficeAdmin",
  "AccountsTeam",
  "LeaseTeam",
  "LandlordsTeam",
];

const ALLOWED_INTERNAL_ROLES = [...INTERNAL_ROLES];

// Work order routes — internal team only (no BrokerageAdmin access to ops)
const WORK_ORDER_ROLES = ["Admin", "OfficeAdmin", ...TEAM_ROLES];

// Work order + vendor combined
const WORK_ORDER_AND_VENDOR_ROLES = [...WORK_ORDER_ROLES, "Vendor"];

const ALL_ROLES = [...INTERNAL_ROLES, "Vendor", "Owner", "Tenant"];

module.exports = {
  TEAM_ROLES,
  BROKERAGE_ROLES,
  BROKERAGE_STAFF_ROLES,
  INTERNAL_ROLES,
  ACCOUNTS_ROLES,
  ALLOWED_INTERNAL_ROLES,
  WORK_ORDER_ROLES,
  WORK_ORDER_AND_VENDOR_ROLES,
  ALL_ROLES,
};
