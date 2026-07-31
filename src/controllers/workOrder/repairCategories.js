const Category = require("../../models/repairCategories");
const ServiceAgreement = require("../../models/ServiceAgreement");
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

// Combined Work Order + Service Agreement categories for vendor filters
exports.getVendorCombinedCategories = async (req, res) => {
  try {
    const workOrderCategories = await Category.find({ type: "workOrder" })
      .select("_id name")
      .lean();

    const saCategoryValues = await ServiceAgreement.distinct("category");

    const woNamesLower = new Set(
      workOrderCategories.map((c) => c.name.trim().toLowerCase()),
    );
    const woIdsAsString = new Set(
      workOrderCategories.map((c) => c._id.toString()),
    );

    const isObjectIdLike = (val) => /^[0-9a-fA-F]{24}$/.test(val);

    const plainNames = [];
    const idLikeValues = [];

    saCategoryValues.forEach((val) => {
      if (!val) return;
      if (isObjectIdLike(val)) {
        idLikeValues.push(val);
      } else {
        plainNames.push(val);
      }
    });
    let resolvedIdNames = [];
    if (idLikeValues.length > 0) {
      const resolvedDocs = await Category.find({
        _id: { $in: idLikeValues },
      })
        .select("_id name")
        .lean();
      resolvedIdNames = resolvedDocs.map((c) => c.name);

      const resolvedIdSet = new Set(resolvedDocs.map((c) => c._id.toString()));
      const orphaned = idLikeValues.filter((id) => !resolvedIdSet.has(id));
      if (orphaned.length > 0) {
        console.warn(
          `getVendorCombinedCategories: ${orphaned.length} ServiceAgreement(s) reference a deleted/missing Category id:`,
          orphaned,
        );
      }
    }

    const allSaNames = [...plainNames, ...resolvedIdNames];

    const saOnlyOptions = allSaNames
      .filter((name) => !woNamesLower.has(name.trim().toLowerCase()))
      .filter(
        (name, idx, arr) =>
          arr.findIndex((n) => n.toLowerCase() === name.toLowerCase()) === idx,
      )
      .map((name) => ({ value: `sa:${name}`, label: name }));

    const combined = [
      ...workOrderCategories.map((c) => ({
        value: c._id.toString(),
        label: c.name,
      })),
      ...saOnlyOptions,
    ].sort((a, b) => a.label.localeCompare(b.label));

    return sendSuccess(res, "Combined categories fetched", {
      categories: combined,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch combined categories",
      500,
    );
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
