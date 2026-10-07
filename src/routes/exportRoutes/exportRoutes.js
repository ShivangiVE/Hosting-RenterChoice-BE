const express = require("express");
const router = express.Router();
const {
  exportData,
} = require("../../controllers/exportController/exportController");
const { protect, authorize } = require("../../middleware/authMiddleware");
const { TEAM_ROLES } = require("../../constants/roles");

const ALLOWED_ROLES = ["Admin", "OfficeAdmin", ...TEAM_ROLES, "Vendor"];

router.post("/", protect, authorize(...ALLOWED_ROLES), exportData);

module.exports = router;
