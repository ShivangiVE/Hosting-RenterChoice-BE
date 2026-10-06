const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../../middleware/authMiddleware");
const { getAuditSummary, getBuildingAudit, getPortfolioAudit } = require("../../controllers/auditController/auditController");
const { TEAM_ROLES } = require("../../constants/roles");

// Internal roles allowed
const INTERNAL_ROLES = ["Admin", "OfficeAdmin", ...TEAM_ROLES];

router.get("/summary", protect, authorize(...INTERNAL_ROLES), getAuditSummary);

// Specific building audit
router.get('/building/:buildingId', protect, authorize(...INTERNAL_ROLES), getBuildingAudit);

// Specific portfolio audit
router.get('/portfolio/:portfolioId',protect, authorize(...INTERNAL_ROLES), getPortfolioAudit);


module.exports = router;
