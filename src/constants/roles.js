const TEAM_ROLES = [
  "AccountsTeam",
  "RepairsTeam",
  "LeaseTeam",
  "MarketingTeam",
  "LandlordsTeam",
  "InspectionClerk",
];

const INTERNAL_ROLES = [
  "Admin",
  "BrokerageAdmin",
  "OfficeAdmin",
  ...TEAM_ROLES,
];

const ACCOUNTS_ROLES = [
  "Admin",
  "BrokerageAdmin",
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
  INTERNAL_ROLES,
  ACCOUNTS_ROLES,
  ALLOWED_INTERNAL_ROLES,
  WORK_ORDER_ROLES,
  WORK_ORDER_AND_VENDOR_ROLES,
  ALL_ROLES,
};
