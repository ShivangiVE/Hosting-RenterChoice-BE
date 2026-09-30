const mongoose = require("mongoose");
const { NOTE_SOURCE_TYPES } = require("../../utils/noteSourceTypes");

const noteSchema = new mongoose.Schema(
  {
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NoteCategory",
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

    sourceType: {
      type: String,
      enum: NOTE_SOURCE_TYPES,
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Index for better query performance
noteSchema.index({ category: 1 });
noteSchema.index({ building: 1 });
noteSchema.index({ portfolio: 1 });
noteSchema.index({ workOrder: 1 });
noteSchema.index({ sourceType: 1, sourceId: 1, createdAt: -1 });
noteSchema.index({ createdBy: 1 });
noteSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Note", noteSchema);
