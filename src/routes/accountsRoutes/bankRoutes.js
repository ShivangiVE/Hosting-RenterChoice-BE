const express = require("express");
const { protect } = require("../../middleware/authMiddleware");
const { getBanks } = require("../../controllers/Accounts/bankController");


const router = express.Router();

// Read-only, any authenticated user can populate the dropdown
router.get("/", protect, getBanks);

module.exports = router;
