const InspectionForm = require("../../models/InspectionForm");
const MarketingForm = require("../../models/MarketingForm");
const FormTemplate = require("../../models/FormTemplate");
const { sendSuccess, sendError } = require("../../utils/response");

const validateAgainstTemplate = (template, formData) => {
  const errors = [];

  template.fields.forEach((field) => {
    const val = formData[field.name];

    // required check
    const isEmpty = (v) =>
      v === undefined ||
      v === null ||
      (typeof v === "string" && v.trim() === "") ||
      (Array.isArray(v) && v.length === 0);

    if (field.required && isEmpty(val)) {
      errors.push(`"${field.label}" is required`);
      return;
    }

    if (isEmpty(val)) return;

    switch (field.type) {
      case "number":
        if (isNaN(Number(val)))
          errors.push(`"${field.label}" must be a number`);
        break;
      case "email":
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val)))
          errors.push(`"${field.label}" must be a valid email`);
        break;
      case "select":
      case "radio":
        if (!field.options.includes(val))
          errors.push(`"${field.label}" has an invalid selection`);
        break;
      case "checkbox":
        if (field.options && field.options.length > 0) {
          if (!Array.isArray(val)) {
            errors.push(`"${field.label}" should be an array`);
          } else {
            const invalid = val.filter((v) => !field.options.includes(v));
            if (invalid.length)
              errors.push(`"${field.label}" contains invalid options`);
          }
        } else {
          if (typeof val !== "boolean")
            errors.push(`"${field.label}" must be true/false`);
        }
        break;
      default:
        break;
    }
  });

  return errors;
};

async function saveSubmission(formType, formData, userId) {
  if (formType === "inspection") {
    return InspectionForm.create({
      formData,
      createdBy: userId,
    });
  }
  if (formType === "marketing") {
    return MarketingForm.create({
      formData,
      createdBy: userId,
    });
  }
  throw new Error("Unsupported form type");
}

// ================= INSPECTION =================

exports.createInspectionForm = async (req, res) => {
  try {
    const template = await FormTemplate.findOne({
      formType: "inspection",
      isActive: true,
    });
    if (!template)
      return sendError(res, "Inspection form template not found", 404);

    const formData = req.body;
    const errors = validateAgainstTemplate(template, formData);
    if (errors.length) return sendError(res, errors.join(", "), 400);

    const doc = await saveSubmission("inspection", formData, req.user._id);
    return sendSuccess(res, "Inspection created", { inspection: doc }, 201);
  } catch (err) {
    return sendError(res, err.message || "Failed to create inspection", 500);
  }
};

// Get all inspections
exports.getAllInspections = async (req, res) => {
  try {
    const inspections = await InspectionForm.find({})
      .populate("createdBy", "preferredName email")
      .lean();

    return sendSuccess(res, "Inspections fetched successfully", {
      inspections,
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch inspections", 500);
  }
};

// Get inspection details
exports.getInspectionDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const inspection = await InspectionForm.findById(id).populate(
      "createdBy",
      "preferredName email"
    );
    if (!inspection) return sendError(res, "Inspection not found", 404);

    const template = await FormTemplate.findOne({
      formType: "inspection",
      isActive: true,
    });

    return sendSuccess(res, "Inspection details fetched", {
      inspection,
      template,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch inspection details",
      500
    );
  }
};

// Update inspection
exports.updateInspection = async (req, res) => {
  try {
    const { id } = req.params;
    const formData = req.body;

    const inspection = await InspectionForm.findById(id);
    if (!inspection) return sendError(res, "Inspection not found", 404);

    const template = await FormTemplate.findOne({
      formType: "inspection",
      isActive: true,
    });
    if (!template)
      return sendError(res, "Inspection form template not found", 404);

    const errors = validateAgainstTemplate(template, formData);
    if (errors.length) return sendError(res, errors.join(", "), 400);

    inspection.formData = { ...inspection.formData, ...formData };
    await inspection.save();

    return sendSuccess(res, "Inspection updated successfully", { inspection });
  } catch (err) {
    return sendError(res, err.message || "Failed to update inspection", 500);
  }
};

// Delete inspection
exports.deleteInspection = async (req, res) => {
  try {
    const { id } = req.params;
    const inspection = await InspectionForm.findById(id);
    if (!inspection) return sendError(res, "Inspection not found", 404);

    await inspection.deleteOne();

    return sendSuccess(res, "Inspection deleted successfully");
  } catch (err) {
    return sendError(res, err.message || "Failed to delete inspection", 500);
  }
};

// ================= MARKETING =================

exports.createMarketingForm = async (req, res) => {
  try {
    const template = await FormTemplate.findOne({
      formType: "marketing",
      isActive: true,
    });
    if (!template)
      return sendError(res, "Marketing form template not found", 404);

    const formData = req.body;
    const errors = validateAgainstTemplate(template, formData);
    if (errors.length) return sendError(res, errors.join(", "), 400);

    const doc = await saveSubmission("marketing", formData, req.user._id);
    return sendSuccess(res, "Marketing created", { marketing: doc }, 201);
  } catch (err) {
    return sendError(res, err.message || "Failed to create marketing", 500);
  }
};

exports.getAllMarketing = async (req, res) => {
  try {
    const marketingForms = await MarketingForm.find({})
      .populate("createdBy", "preferredName email")
      .lean();

    return sendSuccess(res, "Marketing forms fetched successfully", {
      marketingForms,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch marketing forms",
      500
    );
  }
};

exports.getMarketingDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const marketing = await MarketingForm.findById(id).populate(
      "createdBy",
      "preferredName email"
    );
    if (!marketing) return sendError(res, "Marketing form not found", 404);

    const template = await FormTemplate.findOne({
      formType: "marketing",
      isActive: true,
    });

    return sendSuccess(res, "Marketing form details fetched", {
      marketing,
      template,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch marketing form details",
      500
    );
  }
};

exports.updateMarketing = async (req, res) => {
  try {
    const { id } = req.params;
    const formData = req.body;

    const marketing = await MarketingForm.findById(id);
    if (!marketing) return sendError(res, "Marketing form not found", 404);

    const template = await FormTemplate.findOne({
      formType: "marketing",
      isActive: true,
    });
    if (!template)
      return sendError(res, "Marketing form template not found", 404);

    const errors = validateAgainstTemplate(template, formData);
    if (errors.length) return sendError(res, errors.join(", "), 400);

    marketing.formData = { ...marketing.formData, ...formData };
    await marketing.save();

    return sendSuccess(res, "Marketing form updated successfully", {
      marketing,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to update marketing form",
      500
    );
  }
};

exports.deleteMarketing = async (req, res) => {
  try {
    const { id } = req.params;
    const marketing = await MarketingForm.findById(id);
    if (!marketing) return sendError(res, "Marketing form not found", 404);

    await marketing.deleteOne();

    return sendSuccess(res, "Marketing form deleted successfully");
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to delete marketing form",
      500
    );
  }
};
