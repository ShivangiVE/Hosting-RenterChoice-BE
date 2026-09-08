const mongoose = require("mongoose");

const vendorResponseSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    response: {
      type: String,
      enum: ["pending", "accepted", "declined", "superseded"],
      default: "pending",
    },
    respondedAt: Date,
    seenAt: Date,
  },
  { _id: false },
);

const serviceAgreementSchema = new mongoose.Schema(
  {
    serviceAgreementNumber: { type: String, required: true, unique: true },

    // ── Recurring cycle tracking ──────────────────────────────────────────
    // baseAgreementNumber is the bare "SA #0072" issued once from the shared
    // Counter, exactly as before. serviceAgreementNumber is what's actually
    // displayed/searched — for a non-recurring SA the two are identical;
    // for a recurring SA, serviceAgreementNumber = baseAgreementNumber +
    // cycleLetter (e.g. "SA #0072a").
    baseAgreementNumber: { type: String, required: true, index: true },

    // Shared by every cycle in the chain — set to the FIRST cycle's own
    // _id at creation time, so `find({ recurringGroupId })` returns the
    // whole recurring history across different vendors/cycles for reporting
    // and invoice sorting.
    recurringGroupId: { type: mongoose.Schema.Types.ObjectId, index: true },

    // 1-indexed position in the recurring chain. cycleLetter is derived
    // from this via cycleNumberToLetters() — cycleNumber is the source of
    // truth, cycleLetter is what's shown to people.
    cycleNumber: { type: Number, default: null },
    cycleLetter: { type: String, default: null },

    previousCycle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceAgreement",
      default: null,
    },
    nextCycleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceAgreement",
      default: null,
    },
    nextCycleCreated: { type: Boolean, default: false },
    // Precomputed the moment THIS cycle is created, so the daily sweep never
    // has to re-derive "when should my successor start" — it just compares
    // this to now().
    nextCycleStartDate: { type: Date, default: null },

    // True on a system-auto-created cycle until a team member routes it
    // (same vendor direct, or out for quotes) via the existing reassign
    // flow. False/never-set on a manually created SA. Drives the
    // "still needs assignment" alert cascade.
    awaitingCycleRouting: { type: Boolean, default: false },
    cycleAlertCount: { type: Number, default: 0 },
    lastCycleAlertFiredAt: { type: Date, default: null },

    // ── Final invoice tracking ────────────────────────────────────────────
    // Manual marker an internal user can set — independent of the
    // automatic end-date notification below, per the client's answer.
    finalInvoiceRequired: { type: Boolean, default: false },
    finalInvoiceRequiredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    finalInvoiceRequiredAt: { type: Date, default: null },

    // Automatic, end-date-triggered notification bookkeeping. If at least
    // one invoice was ever submitted, we send ONE notice and stop
    // (finalInvoiceNoticeSent). If zero invoices were ever submitted, we
    // fire an insistent, repeating reminder instead (the two counters below).
    finalInvoiceNoticeSent: { type: Boolean, default: false },
    finalInvoiceReminderCount: { type: Number, default: 0 },
    lastFinalInvoiceReminderFiredAt: { type: Date, default: null },

    category: { type: String, required: true },
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
    },
    description: { type: String, required: true },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    recurringSchedule: {
      type: String,
      enum: ["Weekly", "Monthly", "Quarterly", "Bi-Annually", "Annually"],
      default: null,
    },
    assignmentType: {
      type: String,
      enum: ["unassigned", "direct", "company"],
      default: "direct",
    },
    assignedCompany: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      index: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    vendorResponses: [vendorResponseSchema],

    vendorResponse: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
    },
    acceptedAt: { type: Date, default: null },

    declinedDate: { type: Date },
    vendorSeenAt: { type: Date, default: null },
    reassignedAt: { type: Date },
    reassignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    fileUrl: { type: String },
    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    closingComments: { type: String },
    closedAt: { type: Date },
    reopenComments: { type: String },
    reopenedAt: { type: Date },
    reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    invoiceUploaded: { type: Boolean, default: false },
    lastInvoiceUploadedAt: { type: Date, default: null },
    invoiceDocuments: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Document" },
    ],
  },
  { timestamps: true },
);

serviceAgreementSchema.index({ recurringGroupId: 1, cycleNumber: 1 });

module.exports = mongoose.model("ServiceAgreement", serviceAgreementSchema);
