const mongoose = require("mongoose");

const reminderScheduleSchema = new mongoose.Schema(
  {
    // ── What to remind about ────────────────────────────────────────────────
    reminderType: {
      type: String,
      required: true,
      // e.g. "INVOICE_UPLOAD_PENDING" | "KEY_RETURN_PENDING"
      // | "INSPECTION_REPORT_PENDING" | "LEASE_EXPIRY_NOTICE" | ...
    },

    // ── Which entity this reminder is for ───────────────────────────────────
    entityType: { type: String, required: true }, // "WorkOrder" | "Inspection" | "Lease" …
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    // ── Who gets notified ───────────────────────────────────────────────────
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: { type: String },

    // ── Lifecycle ───────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["active", "resolved", "cancelled", "paused"],
      default: "active",
      index: true,
    },
    pausedUntil: { type: Date, default: null }, // used when status = "paused"

    // ── Scheduling state ────────────────────────────────────────────────────
    cycleId: { type: String, default: "VENDOR_DEFAULT" }, // named cycle from registry
    reminderCount: { type: Number, default: 0 }, // how many fired so far
    nextFireAt: { type: Date, required: true, index: true }, // when to fire next
    lastFiredAt: { type: Date, default: null },

    // ── Notification payload (frozen at schedule time) ───────────────────────
    notificationTitle: { type: String, required: true },
    notificationMessage: { type: String, required: true },

    // ── Flexible extra data ──────────────────────────────────────────────────
    metadata: { type: Object, default: {} },
  },
  { timestamps: true },
);

// Primary cron query index
reminderScheduleSchema.index({ status: 1, nextFireAt: 1 });
// Dedup index: one active reminder per entity+type
reminderScheduleSchema.index({ entityId: 1, reminderType: 1, status: 1 });

module.exports = mongoose.model("ReminderSchedule", reminderScheduleSchema);
