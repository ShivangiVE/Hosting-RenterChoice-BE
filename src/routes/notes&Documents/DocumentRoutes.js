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
} = require("../../controllers/notes&Documents/DocumentController");

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

// Upload multiple documents
router.post(
  "/upload",
  protect,
  authorize(...ALLOWED_ROLES),
  documentUpload.array("files", 10), // Max 10 files at once
  uploadDocuments
);

// Upload documents by Vendor for a specific Work Order
router.post(
  "/vendor-upload/:workOrderId",
  protect,
  authorize("Vendor"),
  documentUpload.array("files", 10),
  vendorUploadDocuments
);

// Get all documents
router.get("/", protect, authorize(...ALLOWED_ROLES), getDocuments);

// Get documents by building
router.get(
  "/building/:buildingId",
  protect,
  authorize(...ALLOWED_ROLES),
  getDocumentsByBuilding
);

// Get documents by portfolio
router.get(
  "/portfolio/:portfolioId",
  protect,
  authorize(...ALLOWED_ROLES),
  getDocumentsByPortfolio
);

// Get documents by Work Order
router.get(
  "/work-order/:workOrderId",
  protect,
  authorize(...ALLOWED_ROLES, "Vendor"),
  getDocumentsByWorkOrder
);

// Get Documents By Entity
router.get(
  "/entity/:sourceType/:sourceId",
  protect,
  authorize(...ALLOWED_ROLES),
  getDocumentsByEntity
)

// Get single document
router.get("/:id", protect, authorize(...ALLOWED_ROLES), getDocumentById);

// Update document metadata
router.put("/:id", protect, authorize(...ALLOWED_ROLES), updateDocument);

// Delete document
router.delete("/:id", protect, authorize(...ALLOWED_ROLES, "Vendor"), deleteDocument);

// Download document
router.get(
  "/:id/download",
  protect,
  authorize(...ALLOWED_ROLES,"Vendor"),
  downloadDocument
);

module.exports = router;
