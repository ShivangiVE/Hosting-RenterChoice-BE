const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../../middleware/authMiddleware");
const {
  globalSearch,
} = require("../../controllers/SearchController/SearchController");
const { ALLOWED_INTERNAL_ROLES } = require("../../constants/roles");

router.get("/", protect, authorize(...ALLOWED_INTERNAL_ROLES), globalSearch);

module.exports = router;
