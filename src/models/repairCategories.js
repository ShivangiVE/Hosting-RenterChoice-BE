const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true }, // e.g. "Plumbing"
    type: {
      type: String,
      enum: ["workOrder", "inspection", "service"],
      required: true,
    }, // category belongs to which entity
  },
  { timestamps: true }
);

module.exports = mongoose.model("Category", categorySchema);
