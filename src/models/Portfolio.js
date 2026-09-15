const mongoose = require("mongoose");
const portfolioSchema = new mongoose.Schema(
  {
    portfolioName: { type: String, required: true },
    portfolioAbbreviation: { type: String, required: true },
    portfolioAccountNumber: { type: String, unique: true },
    formData: { type: Object, required: true },
    status: {
      type: String,
      enum: ["Active", "Deactivated"],
      default: "Active",
      index: true,
    },
    statusChangedAt: { type: Date, default: null },
    statusChangedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    owners: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true },
);

portfolioSchema.index({ owners: 1, status: 1 });

module.exports = mongoose.model("Portfolio", portfolioSchema);
