const mongoose = require("mongoose");

const { ObjectId } = mongoose.Schema.Types;
const userRef = { type: ObjectId, ref: "User", default: null };

const emailTemplateSchema = new mongoose.Schema(
  {
    // Shown in the dropdown
    title: { type: String, required: true, trim: true, maxlength: 120 },

    // Lowercase title — backs the case-insensitive unique index
    titleKey: { type: String, required: true },

    // Filled into the email when the template is selected
    subject: { type: String, required: true, trim: true, maxlength: 255 },
    body: { type: String, required: true, maxlength: 50000 },

    isActive: { type: Boolean, default: true },

    // Soft delete
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: userRef,

    createdBy: userRef,
    updatedBy: userRef,
  },
  { timestamps: true },
);

emailTemplateSchema.pre("validate", function deriveTitleKey() {
  if (this.isModified("title") && this.title) {
    this.titleKey = this.title.trim().toLowerCase().replace(/\s+/g, " ");
  }
});

// Title must be unique (case-insensitive) among non-deleted templates
emailTemplateSchema.index(
  { titleKey: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);

emailTemplateSchema.index({ isDeleted: 1, isActive: 1, title: 1 });
emailTemplateSchema.index({ isDeleted: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model("EmailTemplate", emailTemplateSchema);
