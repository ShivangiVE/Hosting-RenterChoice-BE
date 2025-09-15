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
      enum: ["pending", "scheduled", "completed", "closed"],
      default: "pending",
    },
    scheduleDate: { type: Date },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    completeDate: { type: Date },
    closingComments: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("InspectionRequest", inspectionRequestSchema);
