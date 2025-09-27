const mongoose = require("mongoose");

const fieldSchema = new mongoose.Schema({
  label: { type: String, required: true },
  name: { type: String, required: true }, // machine name used in formData
  type: {
    type: String,
    enum: [
      "text",
      "number",
      "email",
      "textarea",
      "checkbox",
      "radio",
      "select",
      "date",
      "file",
    ],
    required: true,
  },
  options: { type: [String], default: [] }, // for select / radio / multi-checkbox choices
  required: { type: Boolean, default: false },
  placeholder: { type: String, default: "" },
});

const formTemplateSchema = new mongoose.Schema(
  {
    formName: { type: String, required: true },
    formType: {
      type: String,
      enum: ["portfolio", "building", "inspection", "marketing"],
      required: true,
    },
    fields: [fieldSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isActive: { type: Boolean, default: true },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FormTemplate", formTemplateSchema);
