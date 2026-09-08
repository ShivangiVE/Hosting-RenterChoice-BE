const mongoose = require("mongoose");
const buildingSchema = new mongoose.Schema(
  {
    isMultiUnit: {
      type: Boolean,
      required: [true, "Please specify whether this is a Multi-Unit Building"],
    },

    parentBuilding: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      default: null,
      index: true,
      validate: {
        validator: async function (value) {
          if (!value) return true; // top-level building — nothing to validate
          const parent = await mongoose.model("Building").findById(value);
          if (!parent) return false;
          // Parent must be a top-level building that is itself flagged
          // multi-unit. Blocks both "unit under a non-multi-unit building"
          // and "unit under another unit" (no nesting).
          return parent.isMultiUnit === true && !parent.parentBuilding;
        },
        message:
          "parentBuilding must reference a top-level building with isMultiUnit set to true",
      },
    },

    unitNumber: {
      type: String,
      trim: true,
      required: function () {
        return !!this.parentBuilding;
      },
    },

    buildingAbbreviation: {
      type: String,
      required: function () {
        return this.formData.buildingType === "multi_family";
      },
    },
    portfolio: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Portfolio",
      required: true,
    },
    formData: {
      type: Object,
      required: true,
      default: {
        address: "",
        fullAddress: "",
        city: "",
        buildingType: "",
        unitType: "",
        buildingName: "",
        floorNumber: "",
        totalFloors: "",
        isCondo: false,
        bedrooms: 0,
        bathrooms: 0,
        monthlyRent: 0,
        securityDeposit: 0,
        utilities: "",
        keyNumber: "",
        lockCode: "",
        assignedLockbox: false,
        reasonPropertyLost: "",
        tenancyName: "",
      },
    },
    status: {
      type: String,
      enum: ["vacant", "occupied", "deactivated"],
      default: "vacant",
    },

    inspectionData: {
      type: Object,
      default: null,
    },

    marketingData: {
      type: Object,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Building", buildingSchema);
