const mongoose = require("mongoose");

const serviceAgreementSchema = new mongoose.Schema(
  {
    serviceAgreementNumber: { type: String, required: true, unique: true },
    category: { type: String, required: true },
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
    },
    description: { type: String, required: true },
    initialDueDate: { type: Date },
    recurringSchedule: { type: String },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    fileUrl: { type: String },
    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    closingComments: { type: String },
    closedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ServiceAgreement", serviceAgreementSchema);
