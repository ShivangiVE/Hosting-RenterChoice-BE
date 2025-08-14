const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../../middleware/authMiddleware");
const {
  createBuilding,
  createPortfolio,
  getBuildingDetails,
  getPortfolioDetails,
} = require("../../controllers/building/buildingPortfolioController");

// internal roles allowed to submit
const INTERNAL_ROLES = [
  "OfficeAdmin",
  "AccountsTeam",
  "RepairsTeam",
  "LeaseTeam",
  "MarketingTeam",
  "LandlordsTeam",
  "InspectionClerk",
];

router.post("/building", protect, authorize(...INTERNAL_ROLES), createBuilding);
router.post(
  "/portfolio",
  protect,
  authorize(...INTERNAL_ROLES),
  createPortfolio
);

// get Routes
router.get("/building/:id", protect, getBuildingDetails);
router.get("/portfolio/:id", protect, getPortfolioDetails);

module.exports = router;
