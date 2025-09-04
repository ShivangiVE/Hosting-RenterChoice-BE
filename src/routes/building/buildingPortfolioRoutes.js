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

// ========================= Buildings =========================
router.post("/building", protect, authorize(...INTERNAL_ROLES), createBuilding);

router.get("/buildings", protect, getAllBuildings);
router.get("/building/:id", protect, getBuildingDetails);

router.put(
  "/building/:id",
  protect,
  authorize(...INTERNAL_ROLES),
  updateBuilding
);

// Bulk update buildings
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

// ========================= Portfolios =========================
router.post(
  "/portfolio",
  protect,
  authorize(...INTERNAL_ROLES),
  createPortfolio
);

router.get("/portfolios", protect, getAllPortfolios);
router.get("/portfolio/:id", protect, getPortfolioDetails);

module.exports = router;
