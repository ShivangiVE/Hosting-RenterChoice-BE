const rateLimit = require("express-rate-limit");
const express = require("express");
const {
  getVendors,
  getOwners,
  getMyPortfolios,
  getSupportContact,
  getMyProfile,
  updateMyProfile,
  addMyPortfolio,
} = require("../../controllers/externlusers/externlusers");
const { protect, authorize } = require("../../middleware/authMiddleware");
const { EXTERNAL_PROFILE_ROLES } = require("../../services/profileService");
const router = express.Router();

// Get Vendor List
router.get("/vendors", protect, getVendors);

// Get Owner List
router.get("/owners", protect, getOwners);

router.get("/my-portfolios", protect, authorize("Owner"), getMyPortfolios);

// Max 10 add-portfolio attempts per owner per 15 min (stops number guessing)
const addPortfolioLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => String(req.user._id), // per account, runs after protect
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: false,
    message: "Too many attempts. Please try again in a few minutes.",
  },
});

router.post(
  "/my-portfolios",
  protect,
  authorize("Owner"),
  addPortfolioLimiter,
  addMyPortfolio,
);

router.get("/support-contact", protect, getSupportContact);

// Own profile (external portals only)
router.get(
  "/me/profile",
  protect,
  authorize(...EXTERNAL_PROFILE_ROLES),
  getMyProfile,
);
router.patch(
  "/me/profile",
  protect,
  authorize(...EXTERNAL_PROFILE_ROLES),
  updateMyProfile,
);

module.exports = router;
