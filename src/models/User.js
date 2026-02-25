const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

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

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
    accountNumber: { type: String }, // Optional for Owners/Tenants/Vendors
    companyName: { type: String }, // Only for Vendor
    technicianName: { type: String }, // Only for Vendor
    role: {
      type: String,
      enum: [
        "Admin",
        "OfficeAdmin",
        "AccountsTeam",
        "RepairsTeam",
        "LeaseTeam",
        "MarketingTeam",
        "LandlordsTeam",
        "InspectionClerk",
        // "InspectionTeam",
        "Vendor",

        "Owner",
        "Tenant",
      ],
      required: true,
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
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // who created this user
    managedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // resetPasswordToken: { type: String },
    resetPasswordOTP: { type: String }, // 4-digit code
    resetPasswordExpires: { type: Date }, // OTP expiration time
  },
  { timestamps: true },
);

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

module.exports = mongoose.model("User", userSchema);
