const express = require("express");
const { getVendors, getOwners } = require("../../controllers/externlusers/externlusers");
const { protect } = require("../../middleware/authMiddleware");
const router = express.Router();

// Get Vendor List
router.get("/vendors", protect, getVendors);

// Get Owner List
router.get("/owners", protect, getOwners);

module.exports = router;
