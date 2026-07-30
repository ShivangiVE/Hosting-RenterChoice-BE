const mongoose = require("mongoose");

const extensionSchema = new mongoose.Schema(
  {
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    requestedDate: { type: Date },
    requestedAt: { type: Date, default: Date.now }, // When the request was made
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: { type: Date },
    reviewRemarks: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  { _id: false },
);

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

    assignmentType: {
      type: String,
      enum: ["direct", "company"],
      default: "direct",
    },

    // Set when assignmentType === "company"
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

    // keyIssued: { type: Boolean, default: false },
    keyIssued: {
      type: Boolean,
      default: false,
      immutable: true,
    },

    dueDate: { type: Date },

    // Current/Active extension request
    dueDateExtension: extensionSchema,

    // History of all extension requests
    dueDateExtensionHistory: [extensionSchema],

    fileUrl: { type: String },
    keyReturn: {
      status: {
        type: String,
        enum: ["not_applicable", "pending", "returned"],
        default: "not_applicable",
      },
      returnedAt: Date,
      returnedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      consentCapturedAt: Date,
    },

    invoicePending: { type: Boolean, default: false },
    invoiceUploaded: { type: Boolean, default: false },

    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
    invoiceStatus: {
      type: String,
      enum: [
        "not_uploaded",
        "processing",
        "review_required",
        "confirmed",
        "posted",
      ],
      default: "not_uploaded",
    },

    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
    },
    dynamicStatus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WODynamicStatus",
    },

    vendorResponses: [vendorResponseSchema],

    vendorResponse: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    vendorSeenAt: { type: Date, default: null },
    completeDate: { type: Date },
    declinedDate: { type: Date },
    closingComments: { type: String },
    reopenComments: String,
    reopenedAt: Date,
    reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

workOrderSchema.pre("save", function (next) {
  if (this.status === "closed" && !this.invoiceUploaded) {
    return next(new Error("Cannot close work order without uploading invoice"));
  }
  if (this.invoiceUploaded === true) {
    this.invoicePending = false;
  }
  next();
});

module.exports = mongoose.model("WorkOrder", workOrderSchema);
