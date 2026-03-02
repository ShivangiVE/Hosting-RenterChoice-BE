const VendorType = require("../../models/ContactCards/VendorType");
const { sendError, sendSuccess } = require("../../utils/response");
const slugify = require("slugify");

// Create vendor Types
exports.createVendorType = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name?.trim()) {
      return sendError(res, "Vendor type name is required", 400);
    }

    const slug = slugify(name, { lower: true, strict: true });

    const exists = await VendorType.findOne({ slug });
    if (exists) {
      return sendError(res, "Vendor type already exists", 400);
    }

    const vendorType = await VendorType.create({
      name: name.trim(),
      slug,
      createdBy: req.user._id,
    });

    return sendSuccess(res, "Vendor type created", { vendorType }, 201);
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// Get Vendor Types
exports.getVendorTypes = async (req, res) => {
  try {
    const types = await VendorType.find({ isActive: true })
      .select("_id name slug")
      .sort({ name: 1 });

    return sendSuccess(res, "Vendor types fetched", { types });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// Update Vendor Types
exports.updateVendorType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, isActive } = req.body;

    const type = await VendorType.findById(id);
    if (!type) return sendError(res, "Vendor type not found", 404);

    if (name) {
      type.name = name.trim();
      type.slug = slugify(name, { lower: true, strict: true });
    }

    if (typeof isActive === "boolean") {
      type.isActive = isActive;
    }

    await type.save();

    return sendSuccess(res, "Vendor type updated", { type });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// Delete Vendor Types
exports.deleteVendorType = async (req, res) => {
  try {
    const { id } = req.params;

    const type = await VendorType.findById(id);
    if (!type) return sendError(res, "Vendor type not found", 404);

    // TODO: later check Company usage
    // const Company = require("../../models/Company");
    // const inUse = await Company.findOne({ vendorType: id });

    // if (inUse) {
    //   return sendError(res, "Vendor type is in use", 400);
    // }

    await type.deleteOne();

    return sendSuccess(res, "Vendor type deleted");
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};
