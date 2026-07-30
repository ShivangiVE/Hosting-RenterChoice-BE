const resolveCompanyVendorIds = require("./resolveCompanyVendorIds");

/**
 * Returns a Mongo filter fragment that matches any WorkOrder/ServiceAgreement
 * belonging to the given company — whether assigned via the company pool
 * (assignedCompany) or resolved through an individual vendor's company
 * membership (vendor -> User.company), covering legacy/direct assignments too.
 */
async function buildCompanyScopeFilter(companyId) {
  const vendorIds = await resolveCompanyVendorIds(companyId);

  return {
    $or: [
      { assignedCompany: companyId },
      ...(vendorIds.length > 0 ? [{ vendor: { $in: vendorIds } }] : []),
    ],
  };
}

module.exports = buildCompanyScopeFilter;
