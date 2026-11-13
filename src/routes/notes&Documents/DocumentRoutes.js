const express = require("express");
const { authorize, protect } = require("../../middleware/authMiddleware");
const documentUpload = require("../../middleware/documentUpload");
const {
  uploadDocuments,
  getDocuments,
  getDocumentsByBuilding,
  getDocumentsByPortfolio,
  getDocumentById,
  updateDocument,
  deleteDocument,
  downloadDocument,
  vendorUploadDocuments,
  getDocumentsByWorkOrder,
  getDocumentsByEntity,
  vendorUploadDocumentsForEntity,
  getDocumentViewUrl,
  getOwnerDocuments,
  setDocumentOwnerVisibility,
  ownerUploadDocuments,
} = require("../../controllers/notes&Documents/DocumentController");
const { TEAM_ROLES } = require("../../constants/roles");

const router = express.Router();

const ALLOWED_ROLES = ["Admin", "OfficeAdmin", ...TEAM_ROLES];

// Upload multiple documents
router.post(
  "/upload",
  protect,
  authorize(...ALLOWED_ROLES),
  documentUpload.array("files", 10), // Max 10 files at once
  uploadDocuments,
);

// Upload documents by Vendor for a specific Work Order
router.post(
  "/vendor-upload/:workOrderId",
  protect,
  authorize("Vendor"),
  documentUpload.array("files", 10),
  vendorUploadDocuments,
);

router.post(
  "/vendor-upload/entity/:entityType/:entityId",
  protect,
  authorize("Vendor"),
  documentUpload.array("files", 10),
  vendorUploadDocumentsForEntity,
);

// Get all documents
router.get("/", protect, authorize(...ALLOWED_ROLES), getDocuments);

router.get("/owner", protect, authorize("Owner"), getOwnerDocuments);

// Owner Portal: upload to one of the owner's portfolios
router.post(
  "/owner/upload",
  protect,
  authorize("Owner"),
  documentUpload.array("files", 10),
  ownerUploadDocuments,
);

// Internal: publish / unpublish to Owner Portal
router.patch(
  "/:id/owner-visibility",
  protect,
  authorize(...ALLOWED_ROLES),
  setDocumentOwnerVisibility,
);

// Get documents by building
router.get(
  "/building/:buildingId",
  protect,
  authorize(...ALLOWED_ROLES),
  getDocumentsByBuilding,
);

// Get documents by portfolio
router.get(
  "/portfolio/:portfolioId",
  protect,
  authorize(...ALLOWED_ROLES),
  getDocumentsByPortfolio,
);

// Get documents by Work Order
router.get(
  "/work-order/:workOrderId",
  protect,
  authorize(...ALLOWED_ROLES, "Vendor"),
  getDocumentsByWorkOrder,
);

// Get Documents By Entity
router.get(
  "/entity/:sourceType/:sourceId",
  protect,
  authorize(...ALLOWED_ROLES, "Vendor"),
  getDocumentsByEntity,
);

// Get single document
router.get("/:id", protect, authorize(...ALLOWED_ROLES), getDocumentById);

// Update document metadata
router.put("/:id", protect, authorize(...ALLOWED_ROLES), updateDocument);

// Delete document
router.delete(
  "/:id",
  protect,
  authorize(...ALLOWED_ROLES, "Vendor"),
  deleteDocument,
);

// Get a viewable URL for a document (preview / open-in-new-tab)
router.get(
  "/:id/view-url",
  protect,
  authorize(...ALLOWED_ROLES, "Vendor", "Owner"),
  getDocumentViewUrl,
);

// Download document
router.get(
  "/:id/download",
  protect,
  authorize(...ALLOWED_ROLES, "Vendor", "Owner"),
  downloadDocument,
);

module.exports = router;
