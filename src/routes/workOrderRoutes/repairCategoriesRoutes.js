const express = require("express");
const {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getVendorCombinedCategories,
} = require("../../controllers/workOrder/repairCategories");
const { protect, authorize } = require("../../middleware/authMiddleware");

const router = express.Router();

router.post(
  "/create",
  protect,
  authorize("Admin", "OfficeAdmin"),
  createCategory,
);
router.get("/", getCategories);

router.get(
  "/vendor/combined",
  protect,
  authorize("Vendor"),
  getVendorCombinedCategories,
);

// Update category
router.put("/:id", protect, authorize("Admin", "OfficeAdmin"), updateCategory);

// Delete category
router.delete(
  "/:id",
  protect,
  authorize("Admin", "OfficeAdmin"),
  deleteCategory,
);

module.exports = router;
