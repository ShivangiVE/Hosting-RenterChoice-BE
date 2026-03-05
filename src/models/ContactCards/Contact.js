const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    /* ================= BASIC ================= */

    contactType: {
      type: String,
      enum: ["Owner", "Tenant", "Team", "Subscriber", "Prospect"],
      required: true,
      index: true,
    },

    preferredName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    preferredNameNormalized: {
      type: String,
      index: true,
    },

    legalName: String,

    primaryEmail: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
    },

    primaryEmailNormalized: {
      type: String,
      index: true,
    },

    alternateEmail: String,

    phones: {
      mobile: String,
      home: String,
      work: String,
      other: String,
    },

    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
      index: true,
    },

    /* ================= TENANT ================= */

    tenantInfo: {
      bankName: String,
      homeBranch: String,

      emergencyContact: {
        name: String,
        phone: String,
      },

      insurance: {
        hasInsurance: Boolean,
        provider: String,
        policy: String,
        pocName: String,
        pocPhone: String,
      },

      notes: String,
    },

    /* ================= OWNER ================= */

    ownerInfo: {
      preferredCommunication: String,

      insurance: {
        hasInsurance: Boolean,
        provider: String,
        policy: String,
        pocName: String,
        pocPhone: String,
      },

      additionalUnits: {
        hasUnits: Boolean,
        notes: String,
      },

      notes: String,
    },

    /* ================= TEAM ================= */

    teamInfo: {
      teamAttachedTo: String,
      teamType: String,
      userRole: String,
      permissions: String,
    },

    /* ================= FUTURE ================= */

    subscriberInfo: mongoose.Schema.Types.Mixed,

    prospectInfo: {
      prospectType: {
        type: String,
        enum: ["Owner", "Tenant"],
      },
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    lastUpdatedAt: {
      type: Date,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

contactSchema.pre("save", function (next) {
  if (this.preferredName) {
    this.preferredNameNormalized = this.preferredName.trim().toLowerCase();
  }

  if (this.primaryEmail) {
    this.primaryEmailNormalized = this.primaryEmail.trim().toLowerCase();
  }

  next();
});

contactSchema.index(
  { preferredNameNormalized: 1, primaryEmailNormalized: 1 },
  { unique: true, sparse: true },
);

module.exports = mongoose.model("Contact", contactSchema);
