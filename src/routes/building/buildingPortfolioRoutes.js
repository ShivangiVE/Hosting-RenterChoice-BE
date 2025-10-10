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
  getBuildingsByPortfolio,
  addOwnersToPortfolio,
  removeOwnerFromPortfolio,
  updatePortfolio,
  bulkUpdatePortfolios,
  deletePortfolio,
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

// Update Portfolio
router.put(
  "/portfolio/:id",
  protect,
  authorize(...INTERNAL_ROLES),
  updatePortfolio
);

// Bulk Update Portfolio
router.put(
  "/portfolios/bulk-update",
  protect,
  authorize(...INTERNAL_ROLES),
  bulkUpdatePortfolios
);

// Delete Portfolio
router.delete(
  "/portfolio/:id",
  protect,
  authorize(...INTERNAL_ROLES),
  deletePortfolio
);

router.get(
  "/portfolio/:portfolioId/buildings",
  protect,
  getBuildingsByPortfolio
);

// ========================= Portfolio Owners =========================
router.post(
  "/portfolio/:portfolioId/owners",
  protect,
  authorize(...INTERNAL_ROLES),
  addOwnersToPortfolio
);

router.delete(
  "/portfolio/:portfolioId/owners/:ownerId",
  protect,
  authorize(...INTERNAL_ROLES),
  removeOwnerFromPortfolio
);

module.exports = router;
