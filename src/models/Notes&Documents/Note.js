const mongoose = require("mongoose");

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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
noteSchema.index({ category: 1 });
noteSchema.index({ building: 1 });
noteSchema.index({ portfolio: 1 });
noteSchema.index({ createdBy: 1 });
noteSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Note", noteSchema);
