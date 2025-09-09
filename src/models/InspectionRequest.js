  const mongoose = require("mongoose");

  const inspectionRequestSchema = new mongoose.Schema(
    {
      inspectionNumber: { type: String, required: true, unique: true },
      inspectionType: { type: String, required: true },
      building: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Building",
        required: true,
      },
      notes: { type: String },
      assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      keyIssued: { type: Boolean, default: false },
      dueDate: { type: Date },
      inspectionColour: { type: String },
      status: {
        type: String,
        enum: ["pending", "scheduled", "completed", "cancelled"],
        default: "pending",
      },
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    },
    { timestamps: true }
  );

  module.exports = mongoose.model("InspectionRequest", inspectionRequestSchema);
