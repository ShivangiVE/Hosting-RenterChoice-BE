const express = require("express");

const { protect } = require("../../middleware/authMiddleware");
const {
  getInspectionClerks,
} = require("../../controllers/internalUsers/internalUsers");
const router = express.Router();

// Get Inspection Clerk List
router.get("/inspection-clerks", protect, getInspectionClerks);

module.exports = router;
