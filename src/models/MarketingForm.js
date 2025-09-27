const mongoose = require("mongoose");

const marketingSchema = new mongoose.Schema(
  {
    formData: {
      type: Object,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MarketingForm", marketingSchema);
