const INTERNAL_TEAM = "InternalTeam";

const TEAM_ROLES = [
  "AccountsTeam",
  "RepairsTeam",
  "LeaseTeam",
  "MarketingTeam",
  "LandlordsTeam",
  "InspectionClerk",
  INTERNAL_TEAM,
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
  INTERNAL_TEAM,
];

const ALLOWED_INTERNAL_ROLES = [...INTERNAL_ROLES];

// Work order routes — internal team only (no BrokerageAdmin access to ops)
const WORK_ORDER_ROLES = ["Admin", "OfficeAdmin", ...TEAM_ROLES];

// Work order + vendor combined
const WORK_ORDER_AND_VENDOR_ROLES = [...WORK_ORDER_ROLES, "Vendor"];

const ALL_ROLES = [...INTERNAL_ROLES, "Vendor", "Owner", "Tenant"];

const INTERNAL_TEAM_ROLES = [INTERNAL_TEAM];

// Who can approve / reject owner repair requests.
// Other roles are paused for now — switch to "RepairsTeam" here when they return.
const OWNER_REQUEST_REVIEWER_ROLES = ["OfficeAdmin", "InternalTeam"];

// Who can approve a vendor's company payment info change
const PAYMENT_INFO_REVIEWER_ROLES = ["Admin", "OfficeAdmin", "InternalTeam"];

module.exports = {
  INTERNAL_TEAM,
  INTERNAL_TEAM_ROLES,
  TEAM_ROLES,
  BROKERAGE_ROLES,
  BROKERAGE_STAFF_ROLES,
  INTERNAL_ROLES,
  ACCOUNTS_ROLES,
  ALLOWED_INTERNAL_ROLES,
  WORK_ORDER_ROLES,
  WORK_ORDER_AND_VENDOR_ROLES,
  ALL_ROLES,
  OWNER_REQUEST_REVIEWER_ROLES,
  PAYMENT_INFO_REVIEWER_ROLES,
};
