const WODynamicStatus = require("../../models/WODynamicStatus");
const { sendSuccess, sendError } = require("../../utils/response");
const {
  normalizeStatusName,
  formatDisplayName,
} = require("../../utils/statusUtils");

//  Create Work Order Status
exports.createStatus = async (req, res) => {
  try {
    const { name, isDefault } = req.body;

    const normalized = normalizeStatusName(name);
    const formatted = formatDisplayName(name);

    if (!name) return sendError(res, "Status name is required", 400);

    // Prevent duplicates
    const exists = await WODynamicStatus.findOne({
      nameNormalized: normalized,
    });

    if (exists) return sendError(res, "Status already exists", 400);

    // If marking as default, unset previous default
    if (isDefault) {
      await WODynamicStatus.updateMany({}, { isDefault: false });
    }

    const status = await WODynamicStatus.create({
      name: formatted,
      nameNormalized: normalized,
      isDefault: !!isDefault,
      createdBy: req.user?._id,
    });

    return sendSuccess(res, "Work Order Status created", { status }, 201);
  } catch (err) {
    return sendError(res, err.message || "Failed to create status", 500);
  }
};

// Get All Work Order Statuses
exports.getStatuses = async (req, res) => {
  try {
    const statuses = await WODynamicStatus.find().sort({ createdAt: -1 });
    return sendSuccess(res, "Statuses fetched", { statuses });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch statuses", 500);
  }
};

exports.getVendorStatusOptions = async (req, res) => {
  try {
    const { tab } = req.query;

    const allStatuses = await WODynamicStatus.find().select("name");

    let filterStatuses = [];

    if (tab === "Pending") {
      // Filter dropdown → hide Completed & Declined
      filterStatuses = allStatuses.filter(
        (s) => !["Completed", "Declined"].includes(s.name)
      );
    }

    if (tab === "Completed") {
      const completed = allStatuses.filter((s) => s.name === "Completed");
      const closed = [{ _id: "primary-closed", name: "Closed" }];

      filterStatuses = [...completed, ...closed];
    }

    if (tab === "Declined") {
      filterStatuses = allStatuses.filter((s) => s.name === "Declined");
    }

    return sendSuccess(res, "Statuses filtered", {
      filterStatuses, // Used by filter dropdown
      editStatuses: allStatuses, // Full list used by edit dropdown
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch vendor statuses");
  }
};

// Update Work Order Status
exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, isDefault } = req.body;

    const status = await WODynamicStatus.findById(id);
    if (!status) return sendError(res, "Status not found", 404);

    // If updating name, apply same normalization rules as creation
    if (name) {
      const normalized = normalizeStatusName(name);
      const formatted = formatDisplayName(name);

      // Check duplicate (other status with same normalized name)
      const exists = await WODynamicStatus.findOne({
        _id: { $ne: id },
        nameNormalized: normalized,
      });

      if (exists) {
        return sendError(
          res,
          "Another status with same name already exists",
          400
        );
      }

      status.name = formatted;
      status.nameNormalized = normalized;
    }

    // Handle default status logic
    if (isDefault !== undefined) {
      if (isDefault) {
        await WODynamicStatus.updateMany({}, { isDefault: false });
      }
      status.isDefault = isDefault;
    }

    await status.save();
    return sendSuccess(res, "Status updated", { status });
  } catch (err) {
    return sendError(res, err.message || "Failed to update status", 500);
  }
};

// Delete Work Order Status
exports.deleteStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const status = await WODynamicStatus.findById(id);
    if (!status) return sendError(res, "Status not found", 404);

    await status.deleteOne();
    return sendSuccess(res, "Status deleted");
  } catch (err) {
    return sendError(res, err.message || "Failed to delete status", 500);
  }
};
