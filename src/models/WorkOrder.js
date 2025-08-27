const mongoose = require("mongoose");

const workOrderSchema = new mongoose.Schema(
  {
    workOrderNumber: { type: String, required: true, unique: true },
    workOrderType: {
      type: String,
      enum: ["serviceRequest", "securityDeposit", "quoteRequest"],
      required: true,
    },
    category: { type: String, required: true },
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
    },
    description: { type: String, required: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    keyIssued: { type: Boolean, default: false },
    dueDate: { type: Date },
    fileUrl: { type: String },
    status: {
      type: String,
      enum: ["pending", "inProgress", "completed", "cancelled"],
      default: "pending",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WorkOrder", workOrderSchema);
