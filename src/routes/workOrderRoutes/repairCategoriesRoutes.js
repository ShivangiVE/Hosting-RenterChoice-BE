const express = require("express");
const {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
} = require("../../controllers/workOrder/repairCategories");
const { protect, authorize } = require("../../middleware/authMiddleware");

const router = express.Router();

router.post("/create", protect, createCategory);
router.get("/", getCategories);

// Update category
router.put("/:id", protect, updateCategory);

// Delete category
router.delete("/:id", protect, deleteCategory);

module.exports = router;
