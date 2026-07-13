const mongoose = require("mongoose");

const userStatusLogSchema = new mongoose.Schema(
  {
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ["activated", "deactivated"],
      required: true,
    },
    previousStatus: { type: Boolean, required: true },
    newStatus: { type: Boolean, required: true },
    performedByRole: { type: String, required: true },
    reason: { type: String, trim: true, maxlength: 500 },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true },
);

module.exports = mongoose.model("UserStatusLog", userStatusLogSchema);
