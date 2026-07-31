const ServiceAgreement = require("../models/ServiceAgreement");
const WorkOrder = require("../models/WorkOrder");

/**
 * Registry describing how each vendor-facing entity type resolves,
 * gates (decline check), and links back from Notes/Documents.
 * Add new entity types here — never branch on entityType elsewhere.
 */
const VENDOR_ENTITY_REGISTRY = {
  workOrder: {
    model: WorkOrder,
    label: "work order",
    populate: [{ path: "building" }, { path: "dynamicStatus", select: "name" }],
    isDeclined: (entity) => entity.dynamicStatus?.name === "Declined",
    requiresBuilding: true,

    linkField: "workOrder",
  },
  serviceAgreement: {
    model: ServiceAgreement,
    label: "service agreement",
    populate: [],
    isDeclined: (entity) => entity.vendorResponse === "declined",
    requiresBuilding: false,
    linkField: null,
  },
};

function getVendorEntityConfig(entityType) {
  return VENDOR_ENTITY_REGISTRY[entityType] || null;
}

module.exports = { VENDOR_ENTITY_REGISTRY, getVendorEntityConfig };
