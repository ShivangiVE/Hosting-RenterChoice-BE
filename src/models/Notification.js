const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    role: {
      type: String,
    },

    type: {
      type: String,
      enum: [
        "WORK_ORDER_ASSIGNED",
        "INVOICE_UPLOAD_PENDING",
        "KEY_RETURN_PENDING",
        "DUE_DATE_EXTENSION_REQUESTED",
        "DUE_DATE_EXTENSION_REVIEWED",
        "WORK_ORDER_DECLINED",
        "WORK_ORDER_ACCEPTED",
      ],
      required: true,
    },

    title: { type: String, required: true },
    message: { type: String, required: true },

    entityType: {
      type: String, // "WorkOrder", "Inspection", etc
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
    },

    metadata: {
      type: Object, // flexible (invoiceId, dueDate, status, etc)
    },
    deletedAt: { type: Date, default: null },
    actionTakenAt: { type: Date, default: null },

    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Notification", notificationSchema);
