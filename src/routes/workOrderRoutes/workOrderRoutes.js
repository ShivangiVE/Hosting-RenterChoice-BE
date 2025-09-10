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

router.delete(
  "/work-orders/:id",
  protect,
  authorize(...ALLOWED_ROLES),
  deleteWorkOrder
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

router.delete(
  "/inspection-requests/:id",
  protect,
  authorize(...ALLOWED_ROLES),
  deleteInspectionRequest
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

router.delete(
  "/service-agreements/:id",
  protect,
  authorize(...ALLOWED_ROLES),
  deleteServiceAgreement
);

// ========================= Counter =========================
router.get("/counter/:type", protect, getNextCounterValue);

module.exports = router;
