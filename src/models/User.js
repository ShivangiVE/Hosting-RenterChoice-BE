const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { TEAM_ROLES, LPM_ELIGIBLE_ROLES } = require("../constants/roles");

const userSchema = new mongoose.Schema(
  {
    //     preferredName: {
    //   type: String,
    //   trim: true,
    //   required: function () {
    //     return this.role === "Owner" || this.role === "Tenant";
    //   },
    // },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    preferredName: {
      type: String,
      trim: true,
      required: function () {
        // Require preferredName for all users EXCEPT vendors
        return this.role !== "Vendor";
      },
    },

    legalName: { type: String, trim: true },
    fullName: { type: String, trim: true },
    alternateEmail: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, maxlength: 20, default: "" },
    replyToEmail: { type: String, trim: true, lowercase: true },
    alertEmail: { type: String, trim: true, lowercase: true },
    timeZone: { type: String, trim: true, default: "America/New_York" },
    contactInfo: { type: String, trim: true },
    emailSignature: { type: String, trim: true, maxlength: 500 },

    printfection: {
      monthlyBudget: { type: Number, default: 0, min: 0 },
      canIssueSwag: { type: Boolean, default: false },
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
    accountNumber: { type: String }, // Optional for Owners/Tenants/Vendors

    // company: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: "Company",
    //   required: function () {
    //     return this.role === "Vendor";
    //   },
    //   index: true,
    // },

    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: function () {
        return this.role === "Vendor" && this.isNew;
      },
      index: true,
    }, // Only for Vendor

    technicianName: { type: String }, // Only for Vendor
    role: {
      type: String,
      enum: [
        "Admin",
        "BrokerageAdmin",
        "BrokerageAccounts",
        "BrokerageUser",
        "OfficeAdmin",
        "AccountsTeam",
        "RepairsTeam",
        "LeaseTeam",
        "MarketingTeam",
        "LandlordsTeam",
        "InspectionClerk",
        "InternalTeam",

        // "InspectionTeam",
        "Vendor",

        "Owner",
        "Tenant",
      ],
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // "invited" = account created by staff, password not set yet (owner must
    // finish signup from the invite email). Default "active" keeps every
    // existing user working without a migration.
    accountStatus: {
      type: String,
      enum: ["invited", "active"],
      default: "active",
      index: true,
    },
    ownerInviteSentAt: { type: Date, default: null },

    // Brokerage/Team whose deactivation switched this user off (null = not cascaded).
    // Reactivating that brokerage/team re-activates only these users.
    deactivatedVia: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
      index: true,
    },

    internalWebSessionVersion: {
      type: Number,
      default: 1,
    },

    externalWebSessionVersion: {
      type: Number,
      default: 1,
    },
    profileImage: {
      type: String,
      default: "",
    },
    defaultRepairTab: {
      type: String,
      enum: ["Work Order", "Tasks"],
      default: "Work Order",
    },
    itemsPerPagePreference: {
      type: Number,
      enum: [10, 25, 50, 100],
      default: 10,
    },
    // Brokerage / Team (office) this user belongs to — set for the admins
    // created from the Master Admin "Create Team" page.
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
      index: true,
    },

    isLPM: { type: Boolean, default: false },
    lpmUpdatedAt: { type: Date, default: null },
    lpmUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // One-time "set your password" invite (only a SHA-256 hash is stored)
    inviteTokenHash: { type: String, index: true, select: false },
    inviteExpires: { type: Date, select: false },
    inviteAcceptedAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // who created this user
    managedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // resetPasswordToken: { type: String },
    // External reset (Owner / Vendor / Tenant): HMAC of the code, never the code itself
    resetPasswordOTP: { type: String, select: false },
    resetPasswordOTPAttempts: { type: Number, default: 0 },
    resetPasswordExpires: { type: Date }, // OTP expiration time

    // Internal "reset via email link" — only the SHA-256 hash is stored
    // resetPasswordToken: { type: String, select: false, index: true },
    // resetPasswordTokenExpires: { type: Date, default: null },

    // Portfolio-deactivation "notify team admin" throttling (Owner login
    // flow): max 3 sends total, 3-day gap required between each.
    portfolioNoticeCount: { type: Number, default: 0 },
    lastPortfolioNoticeAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Only Team Admins + internal team members can be LPMs (enforced on every save)
userSchema.pre("validate", function (next) {
  if (this.isLPM && !LPM_ELIGIBLE_ROLES.includes(this.role)) this.isLPM = false;
  next();
});
// Hash password before save
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.index({ createdBy: 1, role: 1, createdAt: -1 });

// Fast "LPMs in this team" lookups (index only holds LPM users)
userSchema.index(
  { createdBy: 1, isLPM: 1 },
  { partialFilterExpression: { isLPM: true } },
);

module.exports = mongoose.model("User", userSchema);
