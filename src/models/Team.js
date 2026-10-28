const mongoose = require("mongoose");

/**
 * A Renter's Choice organisation unit created by the Master Admin from the
 * "Create Team" page.
 *
 *   franchise → a BROKERAGE  (e.g. "Renters Choice and Management LTD")
 *   expansion → a TEAM/OFFICE that sits under one brokerage
 *               (e.g. Calgary, Lethbridge)
 *   subscribe → not supported yet (client: "not ready for yet")
 *
 * A brokerage can have many teams; every team belongs to exactly one brokerage.
 */
const TEAM_TYPES = ["franchise", "expansion"];
const TIME_ZONES = ["PDT", "MST", "CST", "EDT"];

const teamSchema = new mongoose.Schema(
  {
    teamType: { type: String, enum: TEAM_TYPES, required: true, index: true },

    // Only for expansion teams — the brokerage this team belongs to
    parentBrokerage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
      index: true,
      required: function () {
        return this.teamType === "expansion";
      },
    },

    // ── Business info ──
    businessLegalName: { type: String, required: true, trim: true },
    uniqueIdNumber: {
      type: String,
      trim: true,
      uppercase: true,
      immutable: true,
    },
    companyPhone: { type: String, trim: true },
    alternatePhone: { type: String, trim: true },
    companyAddress: { type: String, trim: true },
    companyCity: { type: String, trim: true },
    postalCode: { type: String, trim: true, uppercase: true },
    gstDetails: { type: String, trim: true },
    timeZone: { type: String, enum: TIME_ZONES, default: "MST" },

    // ── Team info ── (package values are still TBD by the client → optional)
    packageType: { type: String, trim: true, default: "" },
    anniversaryDate: { type: Date, default: null },

    // ── Banking ──
    // TODO(security): free text for now; move to encrypted structured fields
    // once the client finalises what banking data is captured here.
    bankingInfo: { type: String, trim: true },
    yearEndAuditDate: { type: Date, default: null }, // franchise only

    // The Brokerage Admin / Office Admin created together with this record
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    status: {
      type: String,
      enum: ["Active", "Deactivated"],
      default: "Active",
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

// "Our Unique ID Number" must be unique when provided
teamSchema.index(
  { uniqueIdNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { uniqueIdNumber: { $type: "string", $gt: "" } },
  },
);

// A team must hang off a brokerage, never off another team
teamSchema.pre("validate", async function (next) {
  if (this.teamType !== "expansion") {
    this.parentBrokerage = null;
    return next();
  }
  if (!this.isModified("parentBrokerage") && !this.isNew) return next();

  const parent = await this.constructor
    .findById(this.parentBrokerage)
    .select("teamType status")
    .session(this.$session() || null)
    .lean();

  if (!parent || parent.teamType !== "franchise") {
    return next(new Error("Parent brokerage not found"));
  }
  if (parent.status !== "Active") {
    return next(new Error("Parent brokerage is deactivated"));
  }
  next();
});

teamSchema.statics.TEAM_TYPES = TEAM_TYPES;
teamSchema.statics.TIME_ZONES = TIME_ZONES;

module.exports = mongoose.model("Team", teamSchema);
