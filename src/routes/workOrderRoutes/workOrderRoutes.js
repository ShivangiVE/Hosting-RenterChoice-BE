const express = require("express");
const { protect, authorize } = require("../../middleware/authMiddleware");
const {
  createWorkOrder,
  getWorkOrders,
  getWorkOrder,
  updateWorkOrderStatus,
  createInspectionRequest,
  createServiceAgreement,
  getInspectionRequests,
  getServiceAgreements,
  getNextCounterValue,
} = require("../../controllers/workOrder/workOrderController");
const upload = require("../../middleware/repairUpload");
const router = express.Router();

const ALLOWED_ROLES = [
  "Admin",
  "OfficeAdmin",
  "AccountsTeam",
  "RepairsTeam",
  "LeaseTeam",
  "MarketingTeam",
  "LandlordsTeam",
  "InspectionClerk",
];

// Create routes
router.post(
  "/work-order",
  protect,
  authorize(...ALLOWED_ROLES),
  upload.workOrderUpload.single("file"),
  createWorkOrder
);
router.post(
  "/inspection-request",
  protect,
  authorize(...ALLOWED_ROLES),
  createInspectionRequest
);
router.post(
  "/service-agreement",
  protect,
  authorize(...ALLOWED_ROLES),
  upload.serviceAgreementUpload.single("file"),
  createServiceAgreement
);

// Counter
router.get("/counter/:type", protect, getNextCounterValue);

// Get all routes
router.get("/work-orders", protect, getWorkOrders);
router.get("/inspection-requests", protect, getInspectionRequests);
router.get("/service-agreements", protect, getServiceAgreements);

// Get single work order
router.get("/work-order/:id", protect, getWorkOrder);

// Update work order status
router.put(
  "/work-order/:id/status",
  protect,
  authorize(...ALLOWED_ROLES),
  updateWorkOrderStatus
);

module.exports = router;
