const NoteCategory = require("../../models/Notes&Documents/NoteCategory");
const { sendSuccess, sendError } = require("../../utils/response");

// Create Note Category
exports.createCategory = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) return sendError(res, "Category name is required", 400);

    // Prevent duplicates
    const exists = await NoteCategory.findOne({ name });
    if (exists) return sendError(res, "Category already exists", 400);

    const category = await NoteCategory.create({
      name,
      createdBy: req.user?._id,
    });

    return sendSuccess(res, "Note Category created", { category }, 201);
  } catch (err) {
    return sendError(res, err.message || "Failed to create category", 500);
  }
};

// Get All Note Categories
exports.getCategories = async (req, res) => {
  try {
    const categories = await NoteCategory.find().sort({ createdAt: -1 });
    return sendSuccess(res, "Categories fetched", { categories });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch categories", 500);
  }
};

// Update Note Category
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const category = await NoteCategory.findById(id);
    if (!category) return sendError(res, "Category not found", 404);

    if (name) category.name = name;

    await category.save();
    return sendSuccess(res, "Category updated", { category });
  } catch (err) {
    return sendError(res, err.message || "Failed to update category", 500);
  }
};

// Delete Note Category
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await NoteCategory.findById(id);
    if (!category) return sendError(res, "Category not found", 404);

    // Check if category is being used by any notes
    // const Note = require("../../models/Note");
    // const notesUsingCategory = await Note.findOne({ category: id });

    // if (notesUsingCategory) {
    //   return sendError(
    //     res,
    //     "Cannot delete category. It is being used by one or more notes.",
    //     400
    //   );
    // }

    await category.deleteOne();
    return sendSuccess(res, "Category deleted");
  } catch (err) {
    return sendError(res, err.message || "Failed to delete category", 500);
  }
};
