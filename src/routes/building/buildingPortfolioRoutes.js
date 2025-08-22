const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../../middleware/authMiddleware");
const {
  createBuilding,
  createPortfolio,
  getBuildingDetails,
  getPortfolioDetails,
  getAllBuildings,
  getAllPortfolios,
  updateBuilding,
  deleteBuilding,
  bulkUpdateBuildings,
} = require("../../controllers/building/buildingPortfolioController");

// internal roles allowed to submit
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

router.get("/buildings", protect, getAllBuildings);
router.get("/portfolios", protect, getAllPortfolios);

// Update & Delete Building
router.put(
  "/building/:id",
  protect,
  authorize(...INTERNAL_ROLES),
  updateBuilding
);


router.put(
  "/buildings/bulk-update",
  protect,
  authorize(...INTERNAL_ROLES),
  bulkUpdateBuildings
);


router.delete(
  "/building/:id",
  protect,
  authorize(...INTERNAL_ROLES),
  deleteBuilding
);

module.exports = router;
