const mongoose = require("mongoose");
const {
  SNOOZE_DURATION_VALUES,
  DEFAULT_SNOOZE_DURATION,
} = require("../constants/notifications/snoozeOptions");

const FREQUENCY_ENUM = ["immediately", "every3days", "daily", "weekly"];

const categoryPrefSchema = new mongoose.Schema(
  {
    emailEnabled: { type: Boolean, default: true },
    inAppEnabled: { type: Boolean, default: true },

    appFrequency: {
      type: String,
      enum: FREQUENCY_ENUM,
      default: "immediately",
    },
    emailFrequency: {
      type: String,
      enum: FREQUENCY_ENUM,
      default: "immediately",
    },
  },
  { _id: false },
);

const snoozeSettingsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    defaultDuration: {
      type: String,
      enum: SNOOZE_DURATION_VALUES,
      default: DEFAULT_SNOOZE_DURATION,
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
    snoozeSettings: { type: snoozeSettingsSchema, default: () => ({}) },
  },
  { timestamps: true },
);

module.exports = mongoose.model(
  "NotificationPreference",
  notificationPreferenceSchema,
);
