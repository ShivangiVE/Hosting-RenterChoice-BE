const mongoose = require("mongoose");

const subAccountSchema = new mongoose.Schema(
  {
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

subAccountSchema.index({
  account: 1,
  name: 1,
});

module.exports = mongoose.model("SubAccount", subAccountSchema);
