const mongoose = require("mongoose");

const categoryPrefSchema = new mongoose.Schema(
  {
    emailEnabled: { type: Boolean, default: true },
    inAppEnabled: { type: Boolean, default: true },
    frequency: {
      type: String,
      enum: [
        "immediately",
        "every15min",
        "every30min",
        "hourly",
        "daily",
        "weekly",
      ],
      default: "immediately",
    },
  },
  { _id: false },
);

const notificationPreferenceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    categories: { type: Map, of: categoryPrefSchema, default: {} },
  },
  { timestamps: true },
);

module.exports = mongoose.model(
  "NotificationPreference",
  notificationPreferenceSchema,
);
