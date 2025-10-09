const mongoose = require("mongoose");

const fieldSchema = new mongoose.Schema({
  label: { type: String, required: true },
  name: { type: String, required: true },
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
      "section",
      "card", // NEW: Add card type for grouping
    ],
    required: true,
  },
  options: { type: [String], default: [] },
  required: { type: Boolean, default: false },
  placeholder: { type: String, default: "" },
  section: { type: String, default: "default" },
  isSection: { type: Boolean, default: false },
  sectionId: { type: String },
  // NEW: Card grouping properties
  isCard: { type: Boolean, default: false },
  cardId: { type: String },
  cardTitle: { type: String },
  // Maintain existing branching
  branches: [
    {
      condition: {
        type: String,
        enum: ["equals", "not_equals", "contains", "greater_than", "less_than"],
      },
      value: String,
      action: { type: String, enum: ["show", "hide", "jump_to"] },
      target: String,
      _id: false,
    },
  ],
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
