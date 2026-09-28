const mongoose = require("mongoose");

const bankSchema = new mongoose.Schema(
  {
    institutionNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^\d{3}$/,
    },
    name: { type: String, required: true, trim: true },
    accountNumberMin: { type: Number, required: true, default: 7 },
    accountNumberMax: { type: Number, required: true, default: 12 },
    typicalLengthNote: { type: String, trim: true }, // display hint only, e.g. "10–12 digits commonly used"
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Bank", bankSchema);
