const express = require("express");
const router = express.Router();
const {
  exportData,
} = require("../../controllers/exportController/exportController");
const { protect, authorize } = require("../../middleware/authMiddleware");

const ALLOWED_ROLES = [
  "Admin",
  "OfficeAdmin",
  "AccountsTeam",
  "RepairsTeam",
  "LeaseTeam",
  "MarketingTeam",
  "LandlordsTeam",
  "InspectionClerk",
  "Vendor",
];

router.post("/", protect, authorize(...ALLOWED_ROLES), exportData);

module.exports = router;
