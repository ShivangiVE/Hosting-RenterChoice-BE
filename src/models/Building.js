const mongoose = require("mongoose");
const buildingSchema = new mongoose.Schema(
  {
    buildingAbbreviation: { 
      type: String, 
      required: function() {
        return this.formData.buildingType === 'multi_family';
      } 
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
        buildingType: "",
        unitType: "",
        floorNumber: "",
        isCondo: false,
        bedrooms: 0,
        bathrooms: 0,
        monthlyRent: 0,
        securityDeposit: 0,
        utilities: "",
        reasonPropertyLost: "",
        tenancyName: "",
      },
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
