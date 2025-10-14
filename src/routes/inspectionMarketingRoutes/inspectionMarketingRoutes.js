const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../../middleware/authMiddleware");
const {
  createInspectionForm,
  createMarketingForm,
  getAllInspections,
  getInspectionDetails,
  updateInspection,
  deleteInspection,
  getAllMarketing,
  getMarketingDetails,
  updateMarketing,
  deleteMarketing,
} = require("../../controllers/inspectionMarketing/inspectionMarketingController");

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

// ========================= Inspections =========================
router.post(
  "/inspection",
  protect,
  authorize(...INTERNAL_ROLES),
  createInspectionForm
);

router.get("/inspections", protect, getAllInspections);
router.get("/inspection/:id", protect, getInspectionDetails);

router.put(
  "/inspection/:id",
  protect,
  authorize(...INTERNAL_ROLES),
  updateInspection
);

router.delete(
  "/inspection/:id",
  protect,
  authorize(...INTERNAL_ROLES),
  deleteInspection
);

// ========================= Marketing =========================
router.post(
  "/marketing",
  protect,
  authorize(...INTERNAL_ROLES),
  createMarketingForm
);

router.get("/marketings", protect, getAllMarketing);
router.get("/marketing/:id", protect, getMarketingDetails);

router.put(
  "/marketing/:id",
  protect,
  authorize(...INTERNAL_ROLES),
  updateMarketing
);

router.delete(
  "/marketing/:id",
  protect,
  authorize(...INTERNAL_ROLES),
  deleteMarketing
);


module.exports = router;
