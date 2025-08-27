const express = require("express");
const {
  createCategory,
  getCategories,
} = require("../../controllers/workOrder/repairCategories");
const { protect, authorize } = require("../../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect,  createCategory); 
router.get("/", getCategories); // Fetch categories (optionally by type)

module.exports = router;
