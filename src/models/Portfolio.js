const mongoose = require("mongoose");
const portfolioSchema = new mongoose.Schema(
  {
    portfolioAbbreviation: { type: String, required: true },
    formData: { type: Object, required: true },
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
  { timestamps: true }
);

module.exports = mongoose.model("Portfolio", portfolioSchema);
