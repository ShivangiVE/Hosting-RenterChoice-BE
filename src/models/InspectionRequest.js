const mongoose = require("mongoose");

const inspectionRequestSchema = new mongoose.Schema(
  {
    inspectionNumber: { type: String, required: true, unique: true },
    inspectionType: { type: String, required: true },
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
    },
    notes: { type: String },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    keyIssued: { type: Boolean, default: false },
    keyReturn: {
      status: {
        type: String,
        enum: ["not_issued", "pending", "returned"],
        default: "not_issued",
      },
      returnedAt: Date,
      returnedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    dueDate: { type: Date },
    inspectionColour: { type: String },
    status: {
      type: String,
      enum: ["pending", "scheduled", "completed", "closed"],
      default: "pending",
    },
    scheduleDate: { type: Date },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    completeDate: { type: Date },
    closingComments: { type: String },
    reopenComments: { type: String },
    reopenedAt: { type: Date },
    reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

inspectionRequestSchema.pre("save", function (next) {
  if (this.keyIssued) {
    // Key issued → must track return
    if (!this.keyReturn || this.keyReturn.status === "not_issued") {
      this.keyReturn = { status: "pending" };
    }
  } else {
    // Key not issued → always not_issued
    this.keyReturn = {
      status: "not_issued",
      returnedAt: null,
      returnedBy: null,
    };
  }

  next();
});

module.exports = mongoose.model("InspectionRequest", inspectionRequestSchema);
