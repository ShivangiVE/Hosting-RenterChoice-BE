const mongoose = require("mongoose");
const buildingSchema = new mongoose.Schema(
  {
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
        floorNumber: "",
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Building", buildingSchema);
