const express = require("express");
const {
  createStatus,
  getStatuses,
  updateStatus,
  deleteStatus,
  getVendorStatusOptions,
} = require("../../controllers/workOrder/woDynamicStatusController");
const { authorize, protect } = require("../../middleware/authMiddleware");

const router = express.Router();

// Allow Admin and OfficeAdmin to manage statuses
router.post(
  "/create",
  protect,
  authorize("Admin", "OfficeAdmin"),
  createStatus
);
router.get("/", protect, getStatuses);
router.get("/vendor/status-options", getVendorStatusOptions);
router.put("/:id", protect, authorize("Admin", "OfficeAdmin"), updateStatus);
router.delete("/:id", protect, authorize("Admin", "OfficeAdmin"), deleteStatus);

module.exports = router;
