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
  getBuildingWithInspection,
  getBuildingWithMarketing,
  updateBuildingMarketing,
  updateBuildingInspection,
  getPortfoliosList,
  getBuildingsList,
} = require("../../controllers/building/buildingPortfolioController");
const { ALLOWED_INTERNAL_ROLES } = require("../../constants/roles");
const {
  createUnit,
  getUnitsByBuilding,
} = require("../../controllers/building/Buildingunitcontroller");

// ========================= Buildings =========================
router.post(
  "/building",
  protect,
  authorize(...ALLOWED_INTERNAL_ROLES),
  createBuilding,
);

router.post(
  "/building/:id/units",
  protect,
  authorize(...ALLOWED_INTERNAL_ROLES),
  createUnit,
);

router.get(
  "/buildings",
  protect,
  authorize(...ALLOWED_INTERNAL_ROLES),
  getAllBuildings,
);

router.get(
  "/buildings/list",
  protect,
  authorize(...ALLOWED_INTERNAL_ROLES),
  getBuildingsList,
);

router.get(
  "/building/:id/units",
  protect,
  authorize(...ALLOWED_INTERNAL_ROLES),
  getUnitsByBuilding,
);

router.get(
  "/building/:id",
  protect,
  authorize(...ALLOWED_INTERNAL_ROLES),
  getBuildingDetails,
);

router.put(
  "/building/:id",
  protect,
  authorize(...ALLOWED_INTERNAL_ROLES),
  updateBuilding,
);

// Bulk update buildings
router.put(
  "/buildings/bulk-update",
  protect,
  authorize(...ALLOWED_INTERNAL_ROLES),
  bulkUpdateBuildings,
);

router.delete(
  "/building/:id",
  protect,
  authorize(...ALLOWED_INTERNAL_ROLES),
  deleteBuilding,
);

// Dynamic Inspection and Marketing Data Routes
router.get("/building/:id/with-inspection", protect, getBuildingWithInspection);

router.get("/building/:id/with-marketing", protect, getBuildingWithMarketing);

// Update only building inspection data
router.put(
  "/building/:id/inspection",
  protect,
  authorize(...ALLOWED_INTERNAL_ROLES),
  updateBuildingInspection,
);

// Update only building marketing data
router.put(
  "/building/:id/marketing",
  protect,
  authorize(...ALLOWED_INTERNAL_ROLES),
  updateBuildingMarketing,
);

// ========================= Portfolios =========================
router.post(
  "/portfolio",
  protect,
  authorize(...ALLOWED_INTERNAL_ROLES),
  createPortfolio,
);
// Get all portfolios
router.get("/portfolios", protect, getAllPortfolios);
// Get portfolio names/abbreviations only (for dropdowns & filters)
router.get("/portfoliolist", protect, getPortfoliosList);
router.get("/portfolio/:id", protect, getPortfolioDetails);

// Update Portfolio
router.put(
  "/portfolio/:id",
  protect,
  authorize(...ALLOWED_INTERNAL_ROLES),
  updatePortfolio,
);

// Bulk Update Portfolio
router.put(
  "/portfolios/bulk-update",
  protect,
  authorize(...ALLOWED_INTERNAL_ROLES),
  bulkUpdatePortfolios,
);

// Delete Portfolio
router.delete(
  "/portfolio/:id",
  protect,
  authorize(...ALLOWED_INTERNAL_ROLES),
  deletePortfolio,
);

router.get(
  "/portfolio/:portfolioId/buildings",
  protect,
  getBuildingsByPortfolio,
);

// ========================= Portfolio Owners =========================
router.post(
  "/portfolio/:portfolioId/owners",
  protect,
  authorize(...ALLOWED_INTERNAL_ROLES),
  addOwnersToPortfolio,
);

router.delete(
  "/portfolio/:portfolioId/owners/:ownerId",
  protect,
  authorize(...ALLOWED_INTERNAL_ROLES),
  removeOwnerFromPortfolio,
);

module.exports = router;
