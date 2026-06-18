const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema(
  {
    accountNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    accountName: {
      type: String,
      required: true,
      trim: true,
    },

    accountType: {
      type: String,
      enum: ["BANK", "LIABILITY", "RE", "INCOME", "EXPENSE"],
      required: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    autoApplyPrepayment: {
      type: Boolean,
      default: false,
    },

    brokerageIncome: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

accountSchema.index({
  accountType: 1,
  accountNumber: 1,
});

module.exports = mongoose.model("Account", accountSchema);
