const { body } = require("express-validator");

exports.registerValidator = [
  body("accountNumber").notEmpty().withMessage("Account Number is required"),
  body("preferredName").custom((value, { req }) => {
    if (req.body.role !== "Vendor" && (!value || value.trim() === "")) {
      throw new Error("Preferred Name is required");
    }
    return true;
  }),
  body("email").isEmail().withMessage("Valid email is required"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
  body("role")
    .isIn(["Vendor", "Owner", "Tenant"])
    .withMessage("Role must be valid"),
  body("companyName").custom((value, { req }) => {
    if (req.body.role === "Vendor" && !value) {
      throw new Error("Company name is required for vendors");
    }
    return true;
  }),
  body("technicianName").custom((value, { req }) => {
    if (req.body.role === "Vendor" && !value) {
      throw new Error("Technician name is required for vendors");
    }
    return true;
  }),
];

exports.loginValidator = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("password").notEmpty().withMessage("Password is required"),
];
