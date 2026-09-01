const mongoose = require("mongoose");

const vendorResponseSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    response: {
      type: String,
      enum: ["pending", "accepted", "declined", "superseded"],
      default: "pending",
    },
    respondedAt: Date,
    seenAt: Date,
  },
  { _id: false },
);

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

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    recurringSchedule: {
      type: String,
      enum: ["Weekly", "Monthly", "Quarterly", "Bi-Annually", "Annually"],
      default: null,
    },
    assignmentType: {
      type: String,
      enum: ["unassigned", "direct", "company"],
      default: "direct",
    },
    assignedCompany: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      index: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    vendorResponses: [vendorResponseSchema],

    vendorResponse: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
    },
    
    acceptedAt: { type: Date, default: null },

    declinedDate: { type: Date },
    vendorSeenAt: { type: Date, default: null },
    reassignedAt: { type: Date },
    reassignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
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
    reopenComments: { type: String },
    reopenedAt: { type: Date },
    reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    invoiceUploaded: { type: Boolean, default: false },
    lastInvoiceUploadedAt: { type: Date, default: null },
    invoiceDocuments: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Document" },
    ],
  },
  { timestamps: true },
);

module.exports = mongoose.model("ServiceAgreement", serviceAgreementSchema);
