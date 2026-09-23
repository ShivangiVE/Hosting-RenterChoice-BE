const mongoose = require("mongoose");
const Company = require("../models/ContactCards/Company");

// Entities that store notes/documents as { sourceType, sourceId }
const NOTE_SOURCE_TYPES = [
  "workOrder",
  "serviceAgreement",
  "inspectionRequest",
  "task",
  "todo",
  "company",
];

/**
 * Validates an optional { sourceType, sourceId } pair on create/upload.
 * Returns null when OK (or when no sourceType was sent, so legacy callers are untouched),
 * otherwise { status, message }.
 */
async function validateSourceRef(sourceType, sourceId) {
  if (!sourceType) return null;

  if (!NOTE_SOURCE_TYPES.includes(sourceType)) {
    return { status: 400, message: "Invalid sourceType" };
  }
  if (!mongoose.isValidObjectId(sourceId)) {
    return { status: 400, message: "Invalid sourceId" };
  }
  if (sourceType === "company" && !(await Company.exists({ _id: sourceId }))) {
    return { status: 404, message: "Company not found" };
  }
  return null;
}

module.exports = { NOTE_SOURCE_TYPES, validateSourceRef };