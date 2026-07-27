const express = require("express");
const { protect, authorize } = require("../../middleware/authMiddleware");
const {
  createCompany,
  listCompanies,
  getCompanyDetails,
  updateCompany,
  removeVendorFromCompany,
  getCompanyWorkOrders,
  getCompanyServiceAgreements,
  getCompanyOverview,
  searchCompanies,
  getCompaniesList,
} = require("../../controllers/contactCards/companyController");

const router = express.Router();

const ALLOWED_ROLES = [
  "Admin",
  "OfficeAdmin",
  "AccountsTeam",
  "RepairsTeam",
  "LeaseTeam",
  "MarketingTeam",
  "LandlordsTeam",
  "InspectionClerk",
];

// Create Company
router.post("/create", protect, authorize(...ALLOWED_ROLES), createCompany);

// Get list of Companies
router.get("/list", protect, authorize(...ALLOWED_ROLES), listCompanies);

// Get list of Companies without pagination for filters and dropdown
router.get("/lookup", protect, authorize(...ALLOWED_ROLES), getCompaniesList);

router.get("/search", protect, authorize(...ALLOWED_ROLES), searchCompanies);

// Get single company details
router.get("/:id", protect, authorize(...ALLOWED_ROLES), getCompanyDetails);

// Get company's vendor work orders
router.get(
  "/:id/work-orders",
  protect,
  authorize(...ALLOWED_ROLES),
  getCompanyWorkOrders,
);

// Get company's vendor service agreements
router.get(
  "/:id/service-agreements",
  protect,
  authorize(...ALLOWED_ROLES),
  getCompanyServiceAgreements,
);

// Get company overview (counts/summary)
router.get(
  "/:id/overview",
  protect,
  authorize(...ALLOWED_ROLES),
  getCompanyOverview,
);

// Update the Company Details
router.put("/:id", protect, authorize(...ALLOWED_ROLES), updateCompany);

// Remove Vendor from Company
router.delete(
  "/:companyId/vendors/:vendorId",
  protect,
  authorize(...ALLOWED_ROLES),
  removeVendorFromCompany,
);

module.exports = router;
