const FormTemplate = require("../../models/FormTemplate");
const { sendSuccess, sendError } = require("../../utils/response");

// Create template
exports.createFormTemplate = async (req, res) => {
  try {
    const { formName, formType, fields } = req.body;
    if (!formName || !formType || !Array.isArray(fields)) {
      return sendError(res, "Invalid payload", 400);
    }

    // Optionally: deactivate previous active template for this type and increment version
    const last = await FormTemplate.findOne({ formType, isActive: true }).sort({
      version: -1,
    });
    let version = 1;
    if (last) {
      // deactivate last
      last.isActive = false;
      await last.save();
      version = (last.version || 1) + 1;
    }

    const tmpl = await FormTemplate.create({
      formName,
      formType,
      fields,
      createdBy: req.user._id,
      version,
    });

    return sendSuccess(res, "Form template created", { template: tmpl }, 201);
  } catch (err) {
    return sendError(res, err.message || "Failed to create template", 500);
  }
};

// Update template (create a new version or edit existing by id)
// exports.updateFormTemplate = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { formName, fields, isActive } = req.body;
//     const tmpl = await FormTemplate.findById(id);
//     if (!tmpl) return sendError(res, "Template not found", 404);

//     tmpl.formName = formName ?? tmpl.formName;
//     tmpl.fields = fields ?? tmpl.fields;
//     if (typeof isActive === "boolean") tmpl.isActive = isActive;
//     tmpl.updatedBy = req.user._id;
//     await tmpl.save();

//     return sendSuccess(res, "Form template updated", { template: tmpl });
//   } catch (err) {
//     return sendError(res, err.message || "Failed to update template", 500);
//   }
// };

exports.updateFormTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { formName, fields, isActive, createNewVersion } = req.body;

    const tmpl = await FormTemplate.findById(id);
    if (!tmpl) return sendError(res, "Template not found", 404);

    if (createNewVersion) {
      // Deactivate current
      tmpl.isActive = false;
      await tmpl.save();

      // Create new version with updated data
      const newVersion = await FormTemplate.create({
        formName: formName ?? tmpl.formName,
        formType: tmpl.formType,
        fields: fields ?? tmpl.fields,
        createdBy: tmpl.createdBy,
        updatedBy: req.user._id,
        isActive: isActive ?? true,
        version: (tmpl.version || 1) + 1,
      });

      return sendSuccess(res, "New version created", { template: newVersion });
    }

    // Simple edit (no version increment)
    tmpl.formName = formName ?? tmpl.formName;
    tmpl.fields = fields ?? tmpl.fields;
    if (typeof isActive === "boolean") tmpl.isActive = isActive;
    tmpl.updatedBy = req.user._id;
    await tmpl.save();

    return sendSuccess(res, "Template updated", { template: tmpl });
  } catch (err) {
    return sendError(res, err.message || "Failed to update template", 500);
  }
};

// Get active template by type
exports.getActiveTemplateByType = async (req, res) => {
  try {
    const { type } = req.params; // 'building' or 'portfolio'
    const tmpl = await FormTemplate.findOne({ formType: type, isActive: true });
    if (!tmpl) return sendError(res, "Template not found", 404);
    return sendSuccess(res, "Template retrieved", { template: tmpl });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch template", 500);
  }
};

// Activate & Deactivate Forms
exports.toggleTemplateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const tmpl = await FormTemplate.findById(id);
    if (!tmpl) return sendError(res, "Template not found", 404);

    // If activating, deactivate all others of same formType
    if (isActive) {
      await FormTemplate.updateMany(
        { formType: tmpl.formType, _id: { $ne: tmpl._id } },
        { $set: { isActive: false } }
      );
    }

    tmpl.isActive = isActive;
    tmpl.updatedBy = req.user._id;
    await tmpl.save();

    // Return updated list for immediate UI refresh
    const updatedList = await FormTemplate.find().sort({ createdAt: -1 });

    return sendSuccess(res, "Template status updated", {
      templates: updatedList,
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to update status", 500);
  }
};

// Get template list
exports.listTemplates = async (req, res) => {
  try {
    const list = await FormTemplate.find().sort({ createdAt: -1 });
    return sendSuccess(res, "Templates retrieved", { templates: list });
  } catch (err) {
    return sendError(res, err.message || "Failed to list templates", 500);
  }
};

// Delete template
exports.deleteTemplate = async (req, res) => {
  try {
    await FormTemplate.findByIdAndDelete(req.params.id);
    return sendSuccess(res, "Template deleted");
  } catch (err) {
    return sendError(res, err.message || "Failed to delete template", 500);
  }
};
