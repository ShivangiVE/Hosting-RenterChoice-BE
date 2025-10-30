const express = require("express");
const { authorize, protect } = require("../../middleware/authMiddleware");
const {
  createCategory,
  updateCategory,
  deleteCategory,
  getCategories,
} = require("../../controllers/notes&Documents/NoteCategoryController");

const router = express.Router();

// Allow Admin and OfficeAdmin to manage statuses
router.post(
  "/create",
  protect,
  authorize("Admin", "OfficeAdmin"),
  createCategory
);
router.get("/", protect, getCategories);
router.put("/:id", protect, authorize("Admin", "OfficeAdmin"), updateCategory);
router.delete(
  "/:id",
  protect,
  authorize("Admin", "OfficeAdmin"),
  deleteCategory
);

module.exports = router;
