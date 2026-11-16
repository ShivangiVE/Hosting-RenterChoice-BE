
const mongoose = require("mongoose");

const { ObjectId } = mongoose.Schema.Types;

const STATUSES = ["pending", "approved", "rejected", "withdrawn", "superseded"];

// The banking details the vendor wants saved
const proposedEpaySchema = new mongoose.Schema(
  {
    bankInfoMethod: { type: String, enum: ["eft", "echeck"], default: "eft" },
    bankId: { type: ObjectId, ref: "Bank", required: true },
    bankName: { type: String, trim: true },
    institutionNumber: { type: String, trim: true },
    transit: { type: String, trim: true },
    accountNumberLast4: { type: String },
    // Kept ONLY while the request is pending; removed once it is decided
    accountNumberEncrypted: { type: String, select: false },
    billingFirstName: { type: String, trim: true },
    billingLastName: { type: String, trim: true },
    billingAddress: { type: String, trim: true },
    billingEmail: { type: String, trim: true },
  },
  { _id: false },
);

const paymentInfoChangeRequestSchema = new mongoose.Schema(
  {
    company: { type: ObjectId, ref: "Company", required: true, index: true },

    // Who entered the details (kept forever for the record)
    requestedBy: { type: ObjectId, ref: "User", required: true },
    requestedByRole: { type: String },

    changeType: { type: String, enum: ["add", "update"], required: true },
    proposed: { type: proposedEpaySchema, required: true },

    // Masked snapshot of what was saved when the request was made
    previous: {
      bankName: String,
      transit: String,
      accountNumberLast4: String,
      updatedAt: Date,
    },

    status: { type: String, enum: STATUSES, default: "pending", index: true },
    reviewedBy: { type: ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNotes: { type: String, trim: true, maxlength: 1000 },
    appliedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Only one open request per company at a time
paymentInfoChangeRequestSchema.index(
  { company: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);
paymentInfoChangeRequestSchema.index({ company: 1, reviewedAt: -1 });

module.exports = mongoose.model(
  "PaymentInfoChangeRequest",
  paymentInfoChangeRequestSchema,
);
