const mongoose = require("mongoose");
const WODynamicStatus = require("../models/WODynamicStatus");
const { normalizeStatusName } = require("./statusUtils");

exports.findDynamicStatus = async (value) => {
  if (!value) return null;

  // If user passed ID
  if (mongoose.Types.ObjectId.isValid(value)) {
    return await WODynamicStatus.findById(value);
  }

  const normalized = normalizeStatusName(value);

  return await WODynamicStatus.findOne({
    nameNormalized: normalized,
  });
};
