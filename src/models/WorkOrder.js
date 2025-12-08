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
      enum: ["open", "closed"],
      default: "open",
    },
    dynamicStatus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WODynamicStatus",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    completeDate: { type: Date },
    declinedDate: { type: Date },
    closingComments: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WorkOrder", workOrderSchema);
