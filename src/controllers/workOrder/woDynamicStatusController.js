const WODynamicStatus = require("../../models/WODynamicStatus");
const { sendSuccess, sendError } = require("../../utils/response");

//  Create Work Order Status
exports.createStatus = async (req, res) => {
  try {
    const { name, description, isDefault } = req.body;
    if (!name) return sendError(res, "Status name is required", 400);

    // Prevent duplicates
    const exists = await WODynamicStatus.findOne({ name });
    if (exists) return sendError(res, "Status already exists", 400);

    // If marking as default, unset previous default
    if (isDefault) {
      await WODynamicStatus.updateMany({}, { isDefault: false });
    }

    const status = await WODynamicStatus.create({
      name,
      description,
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

// Update Work Order Status
exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, isDefault } = req.body;

    const status = await WODynamicStatus.findById(id);
    if (!status) return sendError(res, "Status not found", 404);

    if (name) status.name = name;
    if (description) status.description = description;

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
