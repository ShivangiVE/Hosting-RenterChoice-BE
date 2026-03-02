const express = require("express");
const { protect, authorize } = require("../../middleware/authMiddleware");
const {
  createVendorType,
  getVendorTypes,
  updateVendorType,
  deleteVendorType,
} = require("../../controllers/contactCards/vendorTypeController");

const router = express.Router();

//  Only Master Admin / Admin
router.post("/create", protect, authorize("Admin"), createVendorType);
router.get("/", protect, getVendorTypes);
router.put("/:id", protect, authorize("Admin"), updateVendorType);
router.delete("/:id", protect, authorize("Admin"), deleteVendorType);

module.exports = router;
