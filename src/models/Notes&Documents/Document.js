const mongoose = require("mongoose");
const { NOTE_SOURCE_TYPES } = require("../../utils/noteSourceTypes");

const documentSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    originalFileName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "NoteCategory",
    },
    fileType: {
      type: String,
      required: true,
      enum: ["pdf", "image", "video", "excel", "word", "other"],
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
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
    },
    portfolio: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Portfolio",
    },

    workOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkOrder",
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
    },

    sourceType: {
      type: String,
      enum: NOTE_SOURCE_TYPES,
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
    },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for better query performance
documentSchema.index({ category: 1 });
documentSchema.index({ building: 1 });
documentSchema.index({ portfolio: 1 });
documentSchema.index({ workOrder: 1 });
documentSchema.index({ company: 1, createdAt: -1 });
documentSchema.index({ sourceType: 1, sourceId: 1, createdAt: -1 });
documentSchema.index({ uploadedBy: 1 });
documentSchema.index({ createdAt: -1 });
documentSchema.index({ fileType: 1 });

module.exports = mongoose.model("Document", documentSchema);
