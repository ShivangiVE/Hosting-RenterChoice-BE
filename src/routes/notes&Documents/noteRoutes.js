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

// All routes are protected
router.post("/create", protect, authorize(...ALLOWED_ROLES), createNote);
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
router.get("/:id", protect, authorize(...ALLOWED_ROLES), getNoteById);
router.put("/:id", protect, authorize(...ALLOWED_ROLES), updateNote);
router.delete("/:id", protect, authorize(...ALLOWED_ROLES), deleteNote);

module.exports = router;
