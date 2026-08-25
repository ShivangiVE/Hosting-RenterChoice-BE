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
  vendorDeclineWorkOrder,
  vendorAcceptWorkOrder,
  getVendorNewWorkOrderCount,
  vendorRequestDueDateExtension,
  reviewDueDateExtension,
  vendorConfirmKeyReturn,
  vendorBulkConfirmKeyReturn,
  getWorkOrderTimeline,
  getVendorChatWorkOrders,
  reopenWorkOrder,
  getServiceAgreementById,
  getInspectionRequest,
  reopenServiceAgreement,
  reopenInspectionRequest,
  confirmInspectionKeyReturn,
  bulkConfirmInspectionKeyReturn,
  reassignWorkOrder,
  reassignServiceAgreement,
  getWorkOrderReassignSummary,
  getServiceAgreementReassignSummary,
  getVendorServiceAgreements,
  getVendorNewServiceAgreementCount,
  vendorAcceptServiceAgreement,
  vendorDeclineServiceAgreement,
  getVendorEntities,
} = require("../../controllers/workOrder/workOrderController");
const {
  createAppointment,
  getVendorAppointments,
  getEligibleWorkOrdersForScheduling,
  getAppointmentDetails,
  rescheduleAppointment,
  cancelAppointment,
  getWorkOrderAppointment,
  getEligibleEntitiesForScheduling,
} = require("../../controllers/workOrder/workOrderAppointmentController");
const {
  WORK_ORDER_ROLES,
  WORK_ORDER_AND_VENDOR_ROLES,
} = require("../../constants/roles");
const {
  createInvoiceDraft,
  confirmInvoice,
  finalizeInvoiceLater,
  discardInvoiceDraft,
  createServiceAgreementInvoiceDraft,
  finalizeServiceAgreementInvoice,
} = require("../../controllers/workOrder/invoiceController");
const {
  getEligibleServiceAgreementsForScheduling,
  createServiceAgreementAppointment,
  // getServiceAgreementAppointment,
  getServiceAgreementAppointments,
} = require("../../controllers/workOrder/serviceAgreementAppointmentController");

const router = express.Router();

// ========================= Work Orders =========================
router.post(
  "/work-order",
  protect,
  authorize(...WORK_ORDER_ROLES),
  upload.workOrderUpload.single("file"),
  createWorkOrder,
);

router.get(
  "/work-orders",
  protect,
  authorize(...WORK_ORDER_ROLES),
  getWorkOrders,
);

// Get Work Orders for vendor
router.get(
  "/vendor/my-work-orders",
  protect,
  authorize("Vendor"),
  getVendorWorkOrders,
);

router.get(
  "/vendor/my-entities",
  protect,
  authorize("Vendor"),
  getVendorEntities,
);

// Get Work Orders by Building
router.get(
  "/work-order/by-building",
  protect,
  authorize(...WORK_ORDER_ROLES),
  getWorkOrdersByBuilding,
);

router.get("/work-orders/:id", protect, getWorkOrder);

router.get("/work-orders/:id/reassign-summary", getWorkOrderReassignSummary);

router.get(
  "/vendor/new-count",
  protect,
  authorize("Vendor"),
  getVendorNewWorkOrderCount,
);

router.put(
  "/work-orders/:id",
  protect,
  authorize(...WORK_ORDER_ROLES),
  upload.workOrderUpload.single("file"),
  updateWorkOrder,
);

router.put(
  "/work-orders/:id/status",
  protect,
  authorize(...WORK_ORDER_ROLES),
  updateWorkOrderStatus,
);

// Vendor Accept/Decline Work Order
router.put(
  "/vendor/work-orders/:id/accept",
  protect,
  authorize("Vendor"),
  vendorAcceptWorkOrder,
);

router.put(
  "/vendor/work-orders/:id/decline",
  protect,
  authorize("Vendor"),
  vendorDeclineWorkOrder,
);

// Vendor Update Work Order
router.put(
  "/vendor/work-orders/:id/status",
  protect,
  authorize("Vendor"),
  vendorUpdateWorkOrder,
);

// Vendor — Bulk Update Work Order Status
router.post(
  "/vendor/work-orders/bulk-status",
  protect,
  authorize("Vendor"),
  vendorBulkUpdateWorkOrderStatus,
);

// Vendor Request Due Date Extension
router.post(
  "/:id/request-extension",
  protect,
  authorize("Vendor"),
  vendorRequestDueDateExtension,
);

// Internal Team Review Due Date Extension
router.put(
  "/:id/review-extension",
  protect,
  authorize("Admin", "OfficeAdmin", "RepairsTeam"),
  reviewDueDateExtension,
);

// Vendor Mark Work Orders as Completed
router.put(
  "/vendor/work-orders/:id/complete",
  protect,
  authorize(...WORK_ORDER_AND_VENDOR_ROLES),
  upload.workOrderUpload.array("files", 5),
  markWorkOrderCompleted,
);

// Vendor — Create Invoice Draft (upload + AI extract)
router.post(
  "/vendor/work-orders/:id/invoice-drafts",
  protect,
  authorize("Vendor"),
  upload.invoiceUpload.single("file"),
  createInvoiceDraft,
);

// Vendor — Confirm Extracted Invoice Details
router.patch(
  "/vendor/invoices/:invoiceId/confirm",
  protect,
  authorize("Vendor"),
  confirmInvoice,
);

// Vendor — Finalize Invoice (Upload Later flow, after work order already completed)
router.patch(
  "/vendor/work-orders/:id/invoice/finalize-later",
  protect,
  authorize("Vendor"),
  finalizeInvoiceLater,
);

router.delete(
  "/vendor/invoices/:invoiceId",
  protect,
  authorize("Vendor"),
  discardInvoiceDraft,
);

router.post(
  "/vendor/service-agreements/:id/invoice-drafts",
  protect,
  authorize("Vendor"),
  upload.invoiceUpload.single("file"),
  createServiceAgreementInvoiceDraft,
);

router.patch(
  "/vendor/service-agreements/:id/invoice/finalize",
  protect,
  authorize("Vendor"),
  finalizeServiceAgreementInvoice,
);

// Vendor Upload Invoice Later
router.put(
  "/vendor/work-orders/:id/upload-invoice",
  protect,
  authorize("Vendor"),
  upload.invoiceUpload.array("files", 5),
  vendorUploadInvoiceLater,
);

// Key return Later
router.put(
  "/vendor/work-orders/:id/return-key",
  protect,
  authorize("Vendor"),
  vendorConfirmKeyReturn,
);

// Bulk Key return later
router.put(
  "/vendor/work-orders/return-key/bulk",
  protect,
  authorize("Vendor"),
  vendorBulkConfirmKeyReturn,
);

router.get(
  "/work-orders/:workOrderId/timeline",
  protect,
  authorize(...WORK_ORDER_AND_VENDOR_ROLES),
  getWorkOrderTimeline,
);

router.put(
  "/work-orders/:id/close",
  protect,
  authorize(...WORK_ORDER_AND_VENDOR_ROLES),
  closeWorkOrder,
);

// Reopen Work order
router.put(
  "/work-orders/:id/reopen",
  protect,
  authorize(...WORK_ORDER_ROLES),
  reopenWorkOrder,
);

// Bulk Close Work Orders
router.post(
  "/work-orders/bulk-close",
  protect,
  authorize(...WORK_ORDER_ROLES),
  bulkCloseWorkOrders,
);

router.delete(
  "/work-orders/:id",
  protect,
  authorize(...WORK_ORDER_ROLES),
  deleteWorkOrder,
);

router.post(
  "/work-orders/bulk-delete",
  protect,
  authorize(...WORK_ORDER_ROLES),
  bulkDeleteWorkOrders,
);

router.patch(
  "/work-orders/:id/reassign",
  protect,
  authorize("Admin", "OfficeAdmin"),
  reassignWorkOrder,
);

// ========================= RC Schedule (Vendor Appointments) =========================

// Get eligible work orders for scheduling appointment
router.get(
  "/eligible-work-orders",
  protect,
  authorize("Vendor"),
  getEligibleWorkOrdersForScheduling,
);

router.get(
  "/vendor/eligible-entities",
  protect,
  authorize("Vendor"),
  getEligibleEntitiesForScheduling,
);

// Create appointment
router.post(
  "/vendor/work-orders/appointments",
  protect,
  authorize("Vendor"),
  createAppointment,
);

// Get all appointments for logged-in vendor
router.get(
  "/vendor/work-orders/appointments",
  protect,
  authorize("Vendor"),
  getVendorAppointments,
);

// Get single appointment details
router.get(
  "/vendor/work-orders/appointments/:id",
  protect,
  authorize("Vendor"),
  getAppointmentDetails,
);

router.get(
  "/vendor/work-orders/:workOrderId/appointment",
  protect,
  authorize("Vendor"),
  getWorkOrderAppointment,
);

// Reschedule appointment
router.put(
  "/vendor/work-orders/appointments/:id/reschedule",
  protect,
  authorize("Vendor"),
  rescheduleAppointment,
);

// Cancel appointment
router.put(
  "/vendor/work-orders/appointments/:id/cancel",
  protect,
  authorize("Vendor"),
  cancelAppointment,
);

// ========================= Vendor Chat Work Orders =========================
router.get(
  "/vendor/chat",
  protect,
  authorize("Vendor"),
  getVendorChatWorkOrders,
);

// ========================= Inspection Requests =========================
router.post(
  "/inspection-request",
  protect,
  authorize(...WORK_ORDER_ROLES),
  createInspectionRequest,
);

router.get("/inspection-requests", protect, getInspectionRequests);

// Get Inspection Request by Building
router.get(
  "/inspection-requests/by-building",
  protect,
  authorize(...WORK_ORDER_ROLES),
  getInspectionRequestsByBuilding,
);

// Get Inspection request by Id
router.get(
  "/inspection-requests/:id",
  protect,
  authorize(...WORK_ORDER_ROLES),
  getInspectionRequest,
);

router.put(
  "/inspection-requests/:id",
  protect,
  authorize(...WORK_ORDER_ROLES),
  updateInspectionRequest,
);

router.put(
  "/inspection-requests/:id/close",
  protect,
  authorize(...WORK_ORDER_ROLES),
  closeInspectionRequest,
);

router.put(
  "/inspection-requests/:id/return-key",
  protect,
  authorize(...WORK_ORDER_ROLES),
  confirmInspectionKeyReturn,
);

router.put(
  "/inspection-requests/return-key/bulk",
  protect,
  authorize(...WORK_ORDER_ROLES),
  bulkConfirmInspectionKeyReturn,
);

// Bulk Close Inspection Requests
router.post(
  "/inspection-requests/bulk-close",
  protect,
  authorize(...WORK_ORDER_ROLES),
  bulkCloseInspectionRequests,
);

// Reopen Inspection Request
router.put(
  "/inspection-requests/:id/reopen",
  protect,
  authorize(...WORK_ORDER_ROLES),
  reopenInspectionRequest,
);

router.delete(
  "/inspection-requests/:id",
  protect,
  authorize(...WORK_ORDER_ROLES),
  deleteInspectionRequest,
);

router.post(
  "/inspection-requests/bulk-delete",
  protect,
  authorize(...WORK_ORDER_ROLES),
  bulkDeleteInspectionRequests,
);

// ========================= Service Agreements =========================
router.post(
  "/service-agreement",
  protect,
  authorize(...WORK_ORDER_ROLES),
  upload.serviceAgreementUpload.single("file"),
  createServiceAgreement,
);

router.get("/service-agreements", protect, getServiceAgreements);

// Get Service agreement by Building
router.get(
  "/service-agreements/by-building",
  protect,
  authorize(...WORK_ORDER_ROLES),
  getServiceAgreementsByBuilding,
);

router.get(
  "/service-agreements/:id",
  protect,
  authorize(...WORK_ORDER_AND_VENDOR_ROLES),
  getServiceAgreementById,
);

router.get(
  "/service-agreements/:id/reassign-summary",
  protect,
  authorize(...WORK_ORDER_ROLES),
  getServiceAgreementReassignSummary,
);

router.get(
  "/vendor/my-service-agreements",
  protect,
  authorize("Vendor"),
  getVendorServiceAgreements,
);

router.get(
  "/vendor/service-agreements/new-count",
  protect,
  authorize("Vendor"),
  getVendorNewServiceAgreementCount,
);

router.put(
  "/vendor/service-agreements/:id/accept",
  protect,
  authorize("Vendor"),
  vendorAcceptServiceAgreement,
);
router.put(
  "/vendor/service-agreements/:id/decline",
  protect,
  authorize("Vendor"),
  vendorDeclineServiceAgreement,
);

router.put(
  "/service-agreements/:id",
  protect,
  authorize(...WORK_ORDER_ROLES),
  upload.serviceAgreementUpload.single("file"),
  updateServiceAgreement,
);

router.put(
  "/service-agreements/:id/close",
  protect,
  authorize(...WORK_ORDER_ROLES),
  closeServiceAgreement,
);

// Bulk Close Service Agreements
router.post(
  "/service-agreements/bulk-close",
  protect,
  authorize(...WORK_ORDER_ROLES),
  bulkCloseServiceAgreements,
);

// Reopen Service Agreement
router.put(
  "/service-agreements/:id/reopen",
  protect,
  authorize(...WORK_ORDER_ROLES),
  reopenServiceAgreement,
);

router.delete(
  "/service-agreements/:id",
  protect,
  authorize(...WORK_ORDER_ROLES),
  deleteServiceAgreement,
);

router.post(
  "/service-agreements/bulk-delete",
  protect,
  authorize(...WORK_ORDER_ROLES),
  bulkDeleteServiceAgreements,
);

router.patch(
  "/service-agreements/:id/reassign",
  protect,
  authorize("Admin", "OfficeAdmin"),
  reassignServiceAgreement,
);

// ── Service Agreement scheduling (Vendor) ──────────────────────────────

// Eligible service agreements for scheduling
router.get(
  "/eligible-service-agreements",
  protect,
  authorize("Vendor"),
  getEligibleServiceAgreementsForScheduling,
);

// Create SA appointment
router.post(
  "/vendor/service-agreements/appointments",
  protect,
  authorize("Vendor"),
  createServiceAgreementAppointment,
);

// Get active appointment for one SA
// router.get(
//   "/vendor/service-agreements/:serviceAgreementId/appointment",
//   protect,
//   authorize("Vendor"),
//   getServiceAgreementAppointment,
// );

router.get(
  "/vendor/service-agreements/:serviceAgreementId/appointments",
  protect,
  authorize("Vendor"),
  getServiceAgreementAppointments,
);

// ========================= Counter =========================
router.get("/counter/:type", protect, getNextCounterValue);

module.exports = router;
