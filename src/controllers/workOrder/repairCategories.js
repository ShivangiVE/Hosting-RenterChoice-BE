const Category = require("../../models/repairCategories");
const { sendSuccess, sendError } = require("../../utils/response");

// Create category
exports.createCategory = async (req, res) => {
  try {
    const { name, type } = req.body;

    if (!name || !type) return sendError(res, "Name and type required", 400);

    const category = await Category.create({ name, type });
    return sendSuccess(res, "Category created", { category }, 201);
  } catch (err) {
    return sendError(res, err.message || "Failed to create category", 500);
  }
};

// Get categories by type
exports.getCategories = async (req, res) => {
  try {
    const { type } = req.query; // e.g. ?type=workOrder
    const categories = await Category.find(type ? { type } : {});
    return sendSuccess(res, "Categories fetched", { categories });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch categories", 500);
  }
};

// Update category
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type } = req.body;

    const category = await Category.findById(id);
    if (!category) return sendError(res, "Category not found", 404);

    if (name) category.name = name;
    if (type) category.type = type;

    await category.save();

    return sendSuccess(res, "Category updated", { category });
  } catch (err) {
    return sendError(res, err.message || "Failed to update category", 500);
  }
};

// Delete category
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await Category.findById(id);
    if (!category) return sendError(res, "Category not found", 404);

    await category.deleteOne();

    return sendSuccess(res, "Category deleted");
  } catch (err) {
    return sendError(res, err.message || "Failed to delete category", 500);
  }
};
