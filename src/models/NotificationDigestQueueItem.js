const mongoose = require("mongoose");

const notificationDigestQueueItemSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    categoryKey: { type: String, required: true },
    frequency: { type: String, required: true },
    message: { type: String, required: true },
    title: { type: String },
    sentInDigestAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model(
  "NotificationDigestQueueItem",
  notificationDigestQueueItemSchema,
);
