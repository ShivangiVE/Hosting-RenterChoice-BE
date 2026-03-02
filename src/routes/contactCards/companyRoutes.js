const express = require("express");
const { protect, authorize } = require("../../middleware/authMiddleware");
const {
  createCompany,
  listCompanies,
  getCompanyDetails,
} = require("../../controllers/contactCards/companyController");

const router = express.Router();

// Create Company
router.post(
  "/create",
  protect,
  authorize("Admin", "OfficeAdmin"),
  createCompany,
);

// Get list of Companies
router.get("/list", protect, authorize("Admin", "OfficeAdmin"), listCompanies);

// Get single company details
router.get(
  "/:id",
  protect,
  authorize("Admin", "OfficeAdmin"),
  getCompanyDetails,
);

module.exports = router;
