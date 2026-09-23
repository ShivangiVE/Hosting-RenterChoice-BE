const WorkOrder = require("../models/WorkOrder");
const ServiceAgreement = require("../models/ServiceAgreement");
const User = require("../models/User");

// Entity types that can belong to a company
const COMPANY_LINKED_MODELS = {
  workOrder: WorkOrder,
  serviceAgreement: ServiceAgreement,
};

/**
 * Resolves the company a document should be stamped with.
 * Order: the entity's assignedCompany → the uploading vendor's own company.
 * Returns null when neither applies. Never throws — stamping is best-effort
 * and must not break an upload.
 */
async function resolveCompanyId({
  sourceType,
  sourceId,
  entity = null,
  vendorId = null,
} = {}) {
  try {
    let doc = entity;

    if (!doc && COMPANY_LINKED_MODELS[sourceType] && sourceId) {
      doc = await COMPANY_LINKED_MODELS[sourceType]
        .findById(sourceId)
        .select("assignedCompany vendor")
        .lean();
    }

    if (doc?.assignedCompany) return doc.assignedCompany;

    const userId = vendorId || doc?.vendor;
    if (!userId) return null;

    const user = await User.findById(userId).select("company").lean();
    return user?.company || null;
  } catch (err) {
    console.error("resolveCompanyId failed:", err);
    return null;
  }
}

module.exports = { resolveCompanyId, COMPANY_LINKED_MODELS };
