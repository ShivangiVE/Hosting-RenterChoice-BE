const express = require("express");
const { authorize, protect } = require("../../middleware/authMiddleware");
const {
  createNote,
  getNotes,
  getNoteById,
  updateNote,
  deleteNote,
  getNotesByBuilding,
  getNotesByPortfolio,
  vendorCreateNote,
  getNotesByWorkOrder,
  internalCreateNoteForWorkOrder,
} = require("../../controllers/notes&Documents/NoteController");

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

// const Extra_Roles = [...ALLOWED_ROLES, "Vendor"];

// All routes are protected
router.post("/create", protect, authorize(...ALLOWED_ROLES), createNote);

router.post(
  "/internal-create/:workOrderId",
  protect,
  authorize(...ALLOWED_ROLES),
  internalCreateNoteForWorkOrder
);

// Notes Created by vendor
router.post(
  "/vendor-create/:workOrderId",
  protect,
  authorize("Vendor"),
  vendorCreateNote
);

router.get("/", protect, authorize(...ALLOWED_ROLES), getNotes);

router.get(
  "/building/:buildingId",
  protect,
  authorize(...ALLOWED_ROLES),
  getNotesByBuilding
);

router.get(
  "/portfolio/:portfolioId",
  protect,
  authorize(...ALLOWED_ROLES),
  getNotesByPortfolio
);

// Get Notes By Work Order
router.get(
  "/work-order/:workOrderId",
  protect,
  authorize(...ALLOWED_ROLES, "Vendor"),
  getNotesByWorkOrder
);

router.get("/:id", protect, authorize(...ALLOWED_ROLES, "Vendor"), getNoteById);
router.put("/:id", protect, authorize(...ALLOWED_ROLES, "Vendor"), updateNote);
router.delete(
  "/:id",
  protect,
  authorize(...ALLOWED_ROLES, "Vendor"),
  deleteNote
);

module.exports = router;
