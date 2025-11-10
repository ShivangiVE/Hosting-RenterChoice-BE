const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../../middleware/authMiddleware");
const { getAuditSummary, getBuildingAudit, getPortfolioAudit } = require("../../controllers/auditController/auditController");

// Internal roles allowed
const INTERNAL_ROLES = [
  "Admin",
  "OfficeAdmin",
  "AccountsTeam",
  "RepairsTeam",
  "LeaseTeam",
  "MarketingTeam",
  "LandlordsTeam",
  "InspectionClerk",
];

router.get("/summary", protect, authorize(...INTERNAL_ROLES), getAuditSummary);

// Specific building audit
router.get('/building/:buildingId', protect, authorize(...INTERNAL_ROLES), getBuildingAudit);

// Specific portfolio audit
router.get('/portfolio/:portfolioId',protect, authorize(...INTERNAL_ROLES), getPortfolioAudit);


module.exports = router;
