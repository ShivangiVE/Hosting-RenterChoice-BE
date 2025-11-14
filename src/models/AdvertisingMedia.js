const mongoose = require("mongoose");

const advertisingMediaSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      required: true,
    },
    mediaType: {
      type: String,
      required: true,
      enum: ["image", "video"],
    },
    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    thumbnailUrl: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
advertisingMediaSchema.index({ mediaType: 1 });
advertisingMediaSchema.index({ isActive: 1 });
advertisingMediaSchema.index({ uploadedBy: 1 });
advertisingMediaSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AdvertisingMedia", advertisingMediaSchema);
