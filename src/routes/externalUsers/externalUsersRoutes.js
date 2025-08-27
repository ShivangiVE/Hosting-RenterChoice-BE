const express = require("express");
const { getVendors } = require("../../controllers/externlusers/externlusers");
const { protect } = require("../../middleware/authMiddleware");
const router = express.Router();

// Get Vendor List
router.get("/vendors", protect, getVendors);

module.exports = router;
