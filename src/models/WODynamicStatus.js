const mongoose = require("mongoose");

const woDynamicStatusSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    nameNormalized: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    // description: { type: String },
    isDefault: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WODynamicStatus", woDynamicStatusSchema);
