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
  getWorkOrdersByBuilding,
  getInspectionRequestsByBuilding,
  getServiceAgreementsByBuilding,
  getVendorWorkOrders,
  vendorUpdateWorkOrder,
  vendorBulkUpdateWorkOrderStatus,
  markWorkOrderCompleted,
  vendorUploadInvoiceLater,
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

const Extra_Roles = [...ALLOWED_ROLES, "Vendor"];

// ========================= Work Orders =========================
router.post(
  "/work-order",
  protect,
  authorize(...ALLOWED_ROLES),
  upload.workOrderUpload.single("file"),
  createWorkOrder
);

router.get("/work-orders", protect, authorize(...ALLOWED_ROLES), getWorkOrders);

// Get Work Orders for vendor
router.get(
  "/vendor/my-work-orders",
  protect,
  authorize("Vendor"),
  getVendorWorkOrders
);

// Get Work Orders by Building
router.get(
  "/work-order/by-building",
  protect,
  authorize(...ALLOWED_ROLES),
  getWorkOrdersByBuilding
);

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

// Vendor Update Work Order
router.put(
  "/vendor/work-orders/:id/status",
  protect,
  authorize("Vendor"),
  vendorUpdateWorkOrder
);

// Vendor — Bulk Update Work Order Status
router.post(
  "/vendor/work-orders/bulk-status",
  protect,
  authorize("Vendor"),
  vendorBulkUpdateWorkOrderStatus
);

// Vendor Mark Work Orders as Completed
router.put(
  "/vendor/work-orders/:id/complete",
  protect,
  authorize(...Extra_Roles),
  upload.workOrderUpload.array("files", 5),
  markWorkOrderCompleted
);

// Vendor Upload Invoice Later
router.put(
  "/vendor/work-orders/:id/upload-invoice",
  protect,
  authorize("Vendor"),
  upload.workOrderUpload.array("files", 5),
  vendorUploadInvoiceLater
);

router.put(
  "/work-orders/:id/close",
  protect,
  authorize(...Extra_Roles),
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

// Get Inspection Request by Building
router.get(
  "/inspection-requests/by-building",
  protect,
  authorize(...ALLOWED_ROLES),
  getInspectionRequestsByBuilding
);

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

// Get Service agreement by Building
router.get(
  "/service-agreements/by-building",
  protect,
  authorize(...ALLOWED_ROLES),
  getServiceAgreementsByBuilding
);

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
