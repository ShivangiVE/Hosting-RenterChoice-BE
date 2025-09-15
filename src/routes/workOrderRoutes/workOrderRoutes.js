const express = require("express");
const { protect, authorize } = require("../../middleware/authMiddleware");
const upload = require("../../middleware/repairUpload");
const {
  createWorkOrder,
  getWorkOrders,
  getWorkOrder,
  updateWorkOrder,
  updateWorkOrderStatus,
  deleteWorkOrder,
  createInspectionRequest,
  getInspectionRequests,
  updateInspectionRequest,
  deleteInspectionRequest,
  createServiceAgreement,
  getServiceAgreements,
  updateServiceAgreement,
  deleteServiceAgreement,
  getNextCounterValue,
  closeWorkOrder,
  closeInspectionRequest,
  closeServiceAgreement,
  bulkDeleteWorkOrders,
  bulkDeleteInspectionRequests,
  bulkDeleteServiceAgreements,
  bulkCloseWorkOrders,
  bulkCloseInspectionRequests,
  bulkCloseServiceAgreements,
} = require("../../controllers/workOrder/workOrderController");

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

// ========================= Work Orders =========================
router.post(
  "/work-order",
  protect,
  authorize(...ALLOWED_ROLES),
  upload.workOrderUpload.single("file"),
  createWorkOrder
);

router.get("/work-orders", protect, getWorkOrders);
router.get("/work-orders/:id", protect, getWorkOrder);

router.put(
  "/work-orders/:id",
  protect,
  authorize(...ALLOWED_ROLES),
  upload.workOrderUpload.single("file"),
  updateWorkOrder
);

router.put(
  "/work-orders/:id/status",
  protect,
  authorize(...ALLOWED_ROLES),
  updateWorkOrderStatus
);

router.put(
  "/work-orders/:id/close",
  protect,
  authorize(...ALLOWED_ROLES),
  closeWorkOrder
);

// Bulk Close Work Orders
router.post(
  "/work-orders/bulk-close",
  protect,
  authorize(...ALLOWED_ROLES),
  bulkCloseWorkOrders
);

router.delete(
  "/work-orders/:id",
  protect,
  authorize(...ALLOWED_ROLES),
  deleteWorkOrder
);

router.post(
  "/work-orders/bulk-delete",
  protect,
  authorize(...ALLOWED_ROLES),
  bulkDeleteWorkOrders
);

// ========================= Inspection Requests =========================
router.post(
  "/inspection-request",
  protect,
  authorize(...ALLOWED_ROLES),
  createInspectionRequest
);

router.get("/inspection-requests", protect, getInspectionRequests);

router.put(
  "/inspection-requests/:id",
  protect,
  authorize(...ALLOWED_ROLES),
  updateInspectionRequest
);

router.put(
  "/inspection-requests/:id/close",
  protect,
  authorize(...ALLOWED_ROLES),
  closeInspectionRequest
);

// Bulk Close Inspection Requests
router.post(
  "/inspection-requests/bulk-close",
  protect,
  authorize(...ALLOWED_ROLES),
  bulkCloseInspectionRequests
);

router.delete(
  "/inspection-requests/:id",
  protect,
  authorize(...ALLOWED_ROLES),
  deleteInspectionRequest
);

router.post(
  "/inspection-requests/bulk-delete",
  protect,
  authorize(...ALLOWED_ROLES),
  bulkDeleteInspectionRequests
);

// ========================= Service Agreements =========================
router.post(
  "/service-agreement",
  protect,
  authorize(...ALLOWED_ROLES),
  upload.serviceAgreementUpload.single("file"),
  createServiceAgreement
);

router.get("/service-agreements", protect, getServiceAgreements);

router.put(
  "/service-agreements/:id",
  protect,
  authorize(...ALLOWED_ROLES),
  upload.serviceAgreementUpload.single("file"),
  updateServiceAgreement
);

router.put(
  "/service-agreements/:id/close",
  protect,
  authorize(...ALLOWED_ROLES),
  closeServiceAgreement
);

// Bulk Close Service Agreements
router.post(
  "/service-agreements/bulk-close",
  protect,
  authorize(...ALLOWED_ROLES),
  bulkCloseServiceAgreements
);

router.delete(
  "/service-agreements/:id",
  protect,
  authorize(...ALLOWED_ROLES),
  deleteServiceAgreement
);

router.post(
  "/service-agreements/bulk-delete",
  protect,
  authorize(...ALLOWED_ROLES),
  bulkDeleteServiceAgreements
);

// ========================= Counter =========================
router.get("/counter/:type", protect, getNextCounterValue);

module.exports = router;
