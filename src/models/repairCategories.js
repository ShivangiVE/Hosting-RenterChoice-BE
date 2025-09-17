const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    type: {
      type: String,
      enum: ["workOrder", "inspection", "service", "task", "todo"],
      required: true,
    }, // category belongs to which entity
  },
  { timestamps: true }
);

module.exports = mongoose.model("Category", categorySchema);
