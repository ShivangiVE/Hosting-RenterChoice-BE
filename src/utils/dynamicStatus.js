const mongoose = require("mongoose");
const WODynamicStatus = require("../models/WODynamicStatus");

exports.findDynamicStatus = async (value) => {
  if (!value) return null;

  // If user passed ID
  if (mongoose.Types.ObjectId.isValid(value)) {
    return await WODynamicStatus.findById(value);
  }

  // If user passed name (case-insensitive)
  return await WODynamicStatus.findOne({
    name: { $regex: `^${value}$`, $options: "i" },
  });
};
