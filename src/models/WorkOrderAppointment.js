const mongoose = require("mongoose");

const workOrderAppointmentSchema = new mongoose.Schema(
  {
    workOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkOrder",
      // required: true,
      index: true,
    },

    entityType: {
      type: String,
      enum: ["WorkOrder", "ServiceAgreement"],
      required: true,
      default: "WorkOrder",
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "entityType",
      index: true,
    },

    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },

    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    scheduledDate: {
      type: Date,
      required: true,
      index: true,
    },

    timeSlot: {
      start: { type: String, required: true }, // "10:00"
      end: { type: String, required: true }, // "11:00"
    },

    status: {
      type: String,
      enum: ["scheduled", "rescheduled", "cancelled", "completed"],
      default: "scheduled",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Reschedule tracking
    rescheduleHistory: [
      {
        scheduledDate: { type: Date, required: true },
        timeSlot: {
          start: { type: String, required: true },
          end: { type: String, required: true },
        },
        rescheduledAt: { type: Date, default: Date.now },
        rescheduledBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        reason: { type: String, maxlength: 500 },
      },
    ],

    // Cancellation tracking
    cancelledAt: { type: Date },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    cancellationReason: { type: String, maxlength: 500 },

    // Completion tracking (for future use)
    completedAt: { type: Date },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    completionNotes: { type: String, maxlength: 1000 },
  },

  { timestamps: true },
);

workOrderAppointmentSchema.pre("validate", function (next) {
  if (this.entityType === "ServiceAgreement") {
    if (!this.entityId) {
      return next(
        new Error("entityId is required for ServiceAgreement appointments"),
      );
    }
    return next();
  }

  // entityType === "WorkOrder" (default / legacy path)
  if (!this.workOrder && this.entityId) this.workOrder = this.entityId;
  if (!this.entityId && this.workOrder) this.entityId = this.workOrder;

  if (!this.workOrder) {
    return next(new Error("workOrder is required for WorkOrder appointments"));
  }
  next();
});

workOrderAppointmentSchema.index({ vendor: 1, status: 1, scheduledDate: 1 });
workOrderAppointmentSchema.index({ workOrder: 1, status: 1 });
workOrderAppointmentSchema.index({ entityType: 1, entityId: 1, status: 1 });

module.exports = mongoose.model(
  "WorkOrderAppointment",
  workOrderAppointmentSchema,
);
