const User = require("../../src/models/User");

/**
 * Resolves vendor user IDs attached to a company.
 * Vendors attach themselves via companyAccountNumber verification at signup.
 */
const resolveCompanyVendorIds = async (
  companyId,
  { includeInactive = false } = {},
) => {
  const filter = { company: companyId, role: "Vendor" };
  if (!includeInactive) filter.isActive = true;
  return User.find(filter).distinct("_id");
};

module.exports = resolveCompanyVendorIds;
