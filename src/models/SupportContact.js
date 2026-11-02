const mongoose = require("mongoose");

const supportContactSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true, immutable: true },
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 30 },
    textNumber: { type: String, trim: true, maxlength: 30 },
    hours: { type: String, trim: true, maxlength: 120 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("SupportContact", supportContactSchema);
