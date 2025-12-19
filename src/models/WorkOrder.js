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

    dueDateExtension: {
      requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      requestedDate: { type: Date }, 
      reason: { type: String },
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
    },

    fileUrl: { type: String },
    keyReturnStatus: { type: String },
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
