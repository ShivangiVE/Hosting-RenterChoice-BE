
const mongoose = require("mongoose");

const auditSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      required: true,
      enum: ["portfolio", "building", "tenancy"], // Add more as needed
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: ["created", "updated", "deleted", "viewed", "exported"],
    },
    actionDetails: {
      type: String,
      required: true,
    },
    changes: [
      {
        field: String,
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed,
      },
    ],
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    ipAddress: String,
    userAgent: String,
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
auditSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });
auditSchema.index({ timestamp: -1 });

module.exports = mongoose.model("Audit", auditSchema);
