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
