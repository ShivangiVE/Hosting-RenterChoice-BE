const mongoose = require("mongoose");

const vendorTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      lowercase: true,
      unique: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

vendorTypeSchema.index({ name: 1 });
vendorTypeSchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model("VendorType", vendorTypeSchema);
