const express = require("express");
const {
  getVendors,
  getOwners,
  getMyPortfolios,
} = require("../../controllers/externlusers/externlusers");
const { protect, authorize } = require("../../middleware/authMiddleware");
const router = express.Router();

// Get Vendor List
router.get("/vendors", protect, getVendors);

// Get Owner List
router.get("/owners", protect, getOwners);

router.get("/my-portfolios", protect, authorize("Owner"), getMyPortfolios);

module.exports = router;
