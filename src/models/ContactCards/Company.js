const mongoose = require("mongoose");

const companySchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    companyNameNormalized: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    vendorType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VendorType",
      required: true,
      index: true,
    },

    paymentName: String,
    companyEmail: String,
    companyPhone: String,

    contactName: String,
    contactEmail: String,
    contactPhone: String,

    notes: String,

    isETransferClient: {
      type: Boolean,
      default: false,
    },

    paymentInfo: {
      epay: {
        bankInfoMethod: {
          type: String,
          enum: ["eft", "echeck"],
          default: "eft",
        },
        bankId: { type: mongoose.Schema.Types.ObjectId, ref: "Bank" },
        bankName: { type: String, trim: true },
        institutionNumber: { type: String, trim: true },
        transit: { type: String, trim: true },
        accountNumberLast4: { type: String },
        accountNumberEncrypted: { type: String, select: false },
        // accountType: { type: String, enum: ["checking", "savings"] },
        billingFirstName: String,
        billingLastName: String,
        billingAddress: String,
        billingEmail: String,
        updatedAt: Date,
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    },

    //  AUTO GENERATED
    companyAccountNumber: {
      type: String,
      unique: true,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    lastUpdatedAt: {
      type: Date,
    },
  },

  { timestamps: true },
);

companySchema.pre("save", function (next) {
  if (this.companyName) {
    this.companyNameNormalized = this.companyName.trim().toLowerCase();
  }
  next();
});

module.exports = mongoose.model("Company", companySchema);
