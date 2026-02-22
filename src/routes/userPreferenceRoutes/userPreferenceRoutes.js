const express = require("express");
const { protect } = require("../../middleware/authMiddleware");
const {
  updateRepairPreference,
} = require("../../controllers/UserPreferences/userPreferences");
const router = express.Router();

router.patch("/repair-tab", protect, updateRepairPreference);

module.exports = router;
