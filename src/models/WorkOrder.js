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
    // keyIssued: { type: Boolean, default: false },
    keyIssued: {
      type: Boolean,
      default: false,
      immutable: true,
    },

    dueDate: { type: Date },

    dueDateExtension: {
      requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      requestedDate: { type: Date },
      requestedAt: { type: Date, default: Date.now },
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

    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
    },
    dynamicStatus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WODynamicStatus",
    },

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
  },
  { timestamps: true }
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
