const express = require("express");
const { protect } = require("../../middleware/authMiddleware");
const {
  updateUserPreferences,
} = require("../../controllers/UserPreferences/userPreferences");
const router = express.Router();

router.patch("/user-preferences", protect, updateUserPreferences);

module.exports = router;
