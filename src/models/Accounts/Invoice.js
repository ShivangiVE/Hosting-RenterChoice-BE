const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    workOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkOrder",
      validate: {
        validator: function (value) {
          return Boolean(value) || Boolean(this.serviceAgreement);
        },
        message:
          "Invoice must belong to either a work order or a service agreement",
      },
    },
    serviceAgreement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceAgreement",
      index: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    fileUrl: { type: String, required: true },
    originalFileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true },

    document: { type: mongoose.Schema.Types.ObjectId, ref: "Document" },

    status: {
      type: String,
      enum: ["pending_confirmation", "confirmed", "posted", "discarded"],
      default: "pending_confirmation",
    },

    extractedData: {
      invoiceNumber: { type: String, default: null },
      amount: { type: Number, default: null },
      currency: { type: String, default: "CAD" },
      confidence: {
        invoiceNumber: { type: Number, default: 0 },
        amount: { type: Number, default: 0 },
      },
      provider: { type: String, enum: ["local", "textract"] },
    },

    confirmedData: {
      invoiceNumber: { type: String },
      amount: { type: Number },
      comments: { type: String, maxlength: 1000 },
    },

    billNumber: {
      type: String,
      unique: true,
      sparse: true,
    },

    confirmedAt: { type: Date },
    postedAt: { type: Date },
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

invoiceSchema.index({ workOrder: 1 });
invoiceSchema.index({ status: 1 });

module.exports = mongoose.model("Invoice", invoiceSchema);
