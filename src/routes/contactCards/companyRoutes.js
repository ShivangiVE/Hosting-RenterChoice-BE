const express = require("express");
const { protect, authorize } = require("../../middleware/authMiddleware");
const {
  createCompany,
  listCompanies,
  getCompanyDetails,
  updateCompany,
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

// Get single company details
router.get("/:id", protect, authorize(...ALLOWED_ROLES), getCompanyDetails);

// Update the Company Details
router.put("/:id", protect, authorize(...ALLOWED_ROLES), updateCompany);

module.exports = router;
