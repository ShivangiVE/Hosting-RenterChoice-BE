const mongoose = require("mongoose");
const Building = require("../../models/Building");
const Document = require("../../models/Notes&Documents/Document");
const NoteCategory = require("../../models/Notes&Documents/NoteCategory");
const Portfolio = require("../../models/Portfolio");
const { sendSuccess, sendError } = require("../../utils/response");
const fs = require("fs");
const path = require("path");
const {
  uploadFile,
  deleteFile,
  getFileStream,
  fileExists,
  getFileViewUrl,
} = require("../../utils/storageService");
const WorkOrder = require("../../models/WorkOrder");
const { getFileType } = require("../../utils/fileType");
const { getVendorEntityConfig } = require("../../utils/vendorEntityRegistry");
const { assertVendorCanAccessDocument } = require("../../utils/vendorGuards");
const {
  validateSourceRef,
  NOTE_SOURCE_TYPES,
} = require("../../utils/noteSourceTypes");
const { resolveCompanyId } = require("../../utils/companyScope");
const AuditService = require("../../services/auditService");
const {
  ownerCanAccessDocument,
  getOwnerDocumentScope,
} = require("../../utils/ownerDocumentScope");

// Upload multiple documents
exports.uploadDocuments = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return sendError(res, "No files uploaded", 400);
    }

    const { building, portfolio, documents, workOrder, sourceType, sourceId } =
      req.body;

    // Validate building if provided
    if (building) {
      const buildingExists = await Building.findById(building);
      if (!buildingExists) {
        req.files.forEach((file) => {
          fs.unlinkSync(file.path);
        });
        return sendError(res, "Building not found", 404);
      }
    }

    // Validate portfolio if provided
    if (portfolio) {
      const portfolioExists = await Portfolio.findById(portfolio);
      if (!portfolioExists) {
        req.files.forEach((file) => {
          fs.unlinkSync(file.path);
        });
        return sendError(res, "Portfolio not found", 404);
      }
    }

    // Validate workorder if provided
    if (workOrder) {
      const workOrderExists = await WorkOrder.findById(workOrder);
      if (!workOrderExists) {
        req.files.forEach((file) => fs.unlinkSync(file.path));
        return sendError(res, "Work order not found", 404);
      }
    }

    // Validate polymorphic source (company, task, serviceAgreement, ...)
    const sourceError = await validateSourceRef(sourceType, sourceId);
    if (sourceError) {
      req.files.forEach((file) => {
        try {
          fs.unlinkSync(file.path);
        } catch {}
      });
      return sendError(res, sourceError.message, sourceError.status);
    }

    const companyId = await resolveCompanyId({
      sourceType: sourceType || (workOrder ? "workOrder" : null),
      sourceId: sourceId || workOrder,
    });

    // Parse documents metadata (sent as JSON string)
    let documentsMetadata = [];
    if (documents) {
      try {
        documentsMetadata = JSON.parse(documents);
      } catch (err) {
        console.error("Error parsing documents metadata:", err);
      }
    }

    // Validate that all documents have a category
    for (let i = 0; i < documentsMetadata.length; i++) {
      const metadata = documentsMetadata[i];
      if (!metadata.category || metadata.category.trim() === "") {
        req.files.forEach((file) => {
          fs.unlinkSync(file.path);
        });
        return sendError(res, "Category is required for all documents", 400);
      }
    }

    // Create document records
    const uploadedDocuments = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const metadata = documentsMetadata[i] || {};

      // Validate category if provided
      if (!metadata.category) {
        req.files.forEach((file) => {
          fs.unlinkSync(file.path);
        });
        return sendError(res, "Category is required", 400);
      }

      const categoryExists = await NoteCategory.findById(metadata.category);
      if (!categoryExists) {
        req.files.forEach((file) => {
          fs.unlinkSync(file.path);
        });
        return sendError(res, "Category not found", 404);
      }

      const fileUrl = await uploadFile(file, "uploads/documents");

      const document = await Document.create({
        fileName: metadata.fileName || file.originalname,
        originalFileName: file.originalname,
        description: metadata.description || "",
        category: metadata.category,
        fileType: getFileType(file.mimetype),
        mimeType: file.mimetype,
        fileSize: file.size,
        fileUrl,
        building: building || null,
        portfolio: portfolio || null,
        workOrder: workOrder || null,
        company: companyId || undefined,
        sourceType: sourceType || undefined,
        sourceId: sourceId || undefined,
        uploadedBy: req.user._id,
      });

      await document.populate([
        { path: "category", select: "name" },
        { path: "uploadedBy", select: "preferredName email" },
        { path: "building", select: "buildingAbbreviation formData.address" },
        { path: "portfolio", select: "portfolioAbbreviation formData.name" },
      ]);

      uploadedDocuments.push(document);
    }

    return sendSuccess(
      res,
      "Documents uploaded successfully",
      { documents: uploadedDocuments },
      201,
    );
  } catch (err) {
    console.error("Error uploading documents:", err);
    // Clean up uploaded files on error
    if (req.files) {
      req.files.forEach((file) => {
        try {
          fs.unlinkSync(file.path);
        } catch (unlinkErr) {
          console.error("Error deleting file:", unlinkErr);
        }
      });
    }
    return sendError(res, err.message || "Failed to upload documents", 500);
  }
};

// Upload documents by Vendor for a specific Work Order
exports.vendorUploadDocuments = async (req, res) => {
  try {
    const { workOrderId } = req.params;
    const vendorId = req.user._id;

    if (!req.files || req.files.length === 0) {
      return sendError(res, "No files uploaded", 400);
    }

    // Ensure the work order belongs to the logged-in vendor
    const workOrder = await WorkOrder.findOne({
      _id: workOrderId,
      vendor: vendorId,
    })
      .populate("building")
      .populate("dynamicStatus", "name");

    if (!workOrder) {
      req.files.forEach((file) => {
        try {
          fs.unlinkSync(file.path);
        } catch (err) {}
      });

      return sendError(
        res,
        "You are not allowed to upload documents for this work order",
        403,
      );
    }

    if (workOrder.dynamicStatus?.name === "Declined") {
      if (req.files) {
        req.files.forEach((file) => {
          try {
            fs.unlinkSync(file.path);
          } catch {}
        });
      }
      return sendError(
        res,
        "You cannot upload documents because this work order is Declined",
        403,
      );
    }

    if (!workOrder.building) {
      req.files.forEach((file) => {
        try {
          fs.unlinkSync(file.path);
        } catch (err) {}
      });
      return sendError(
        res,
        "No building is associated with this work order",
        400,
      );
    }

    // Stamp the owning company so this document also shows on the company page
    const companyId = await resolveCompanyId({
      entity: workOrder,
      vendorId,
    });

    // ✔ Auto-detect / auto-create Vendor category (same as vendor notes)
    let vendorCategory = await NoteCategory.findOne({
      name: { $regex: /^vendor$/i },
    });

    if (!vendorCategory) {
      vendorCategory = await NoteCategory.create({
        name: "Vendor",
        createdBy: vendorId,
      });
    }

    const finalCategory = vendorCategory._id;

    // Parse metadata (we ignore category sent by FE now)
    const { documents } = req.body;
    let documentsMetadata = [];

    if (documents) {
      try {
        documentsMetadata = JSON.parse(documents);
      } catch (err) {
        console.error("Error parsing documents metadata:", err);
      }
    }

    const uploadedDocuments = [];

    // Upload each file
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const metadata = documentsMetadata[i] || {};

      // Upload file to storage (S3/local)
      const fileUrl = await uploadFile(file, "uploads/documents");

      // Create document with auto category: Vendor
      const document = await Document.create({
        fileName: metadata.fileName || file.originalname,
        originalFileName: file.originalname,
        description: metadata.description || "",
        category: finalCategory, // ✔ Always Vendor category
        fileType: getFileType(file.mimetype),
        mimeType: file.mimetype,
        fileSize: file.size,
        fileUrl,
        workOrder: workOrder._id,
        company: companyId || undefined,
        building: null,
        portfolio: null,
        uploadedBy: vendorId,
      });

      await document.populate([
        { path: "category", select: "name" },
        {
          path: "uploadedBy",
          select: "preferredName technicianName companyName email",
        },
        { path: "building", select: "buildingAbbreviation formData.address" },
        { path: "portfolio", select: "portfolioAbbreviation formData.name" },
      ]);

      uploadedDocuments.push(document);
    }

    return sendSuccess(
      res,
      "Vendor documents uploaded successfully",
      { documents: uploadedDocuments },
      201,
    );
  } catch (err) {
    console.error("Error uploading vendor documents:", err);

    if (req.files) {
      req.files.forEach((file) => {
        try {
          fs.unlinkSync(file.path);
        } catch (unlinkErr) {}
      });
    }

    return sendError(
      res,
      err.message || "Failed to upload vendor documents",
      500,
    );
  }
};

// Generic: Upload documents by Vendor for any registered entity type
exports.vendorUploadDocumentsForEntity = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const vendorId = req.user._id;

    const config = getVendorEntityConfig(entityType);
    if (!config) {
      if (req.files) {
        req.files.forEach((file) => {
          try {
            fs.unlinkSync(file.path);
          } catch (err) {}
        });
      }
      return sendError(res, `Unsupported entity type: ${entityType}`, 400);
    }

    if (!req.files || req.files.length === 0) {
      return sendError(res, "No files uploaded", 400);
    }

    let query = config.model.findOne({ _id: entityId, vendor: vendorId });
    config.populate.forEach((p) => (query = query.populate(p)));
    const entity = await query;

    if (!entity) {
      req.files.forEach((file) => {
        try {
          fs.unlinkSync(file.path);
        } catch (err) {}
      });
      return sendError(
        res,
        `You are not allowed to upload documents for this ${config.label}`,
        403,
      );
    }

    if (config.isDeclined(entity)) {
      req.files.forEach((file) => {
        try {
          fs.unlinkSync(file.path);
        } catch {}
      });
      return sendError(
        res,
        `You cannot upload documents because this ${config.label} is Declined`,
        403,
      );
    }

    // Only WorkOrder enforces "must have a building" today — driven by config, not a branch
    if (config.requiresBuilding && !entity.building) {
      req.files.forEach((file) => {
        try {
          fs.unlinkSync(file.path);
        } catch (err) {}
      });
      return sendError(
        res,
        `No building is associated with this ${config.label}`,
        400,
      );
    }

    const companyId = await resolveCompanyId({
      sourceType: entityType,
      entity,
      vendorId,
    });

    let vendorCategory = await NoteCategory.findOne({
      name: { $regex: /^vendor$/i },
    });
    if (!vendorCategory) {
      vendorCategory = await NoteCategory.create({
        name: "Vendor",
        createdBy: vendorId,
      });
    }
    const finalCategory = vendorCategory._id;

    const { documents } = req.body;
    let documentsMetadata = [];
    if (documents) {
      try {
        documentsMetadata = JSON.parse(documents);
      } catch (err) {
        console.error("Error parsing documents metadata:", err);
      }
    }

    const uploadedDocuments = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const metadata = documentsMetadata[i] || {};

      const fileUrl = await uploadFile(file, "uploads/documents");

      const document = await Document.create({
        fileName: metadata.fileName || file.originalname,
        originalFileName: file.originalname,
        description: metadata.description || "",
        category: finalCategory,
        fileType: getFileType(file.mimetype),
        mimeType: file.mimetype,
        fileSize: file.size,
        fileUrl,
        ...(config.linkField ? { [config.linkField]: entity._id } : {}),
        sourceType: entityType,
        sourceId: entity._id,
        company: companyId || undefined,
        building: null,
        portfolio: null,
        uploadedBy: vendorId,
      });

      await document.populate([
        { path: "category", select: "name" },
        {
          path: "uploadedBy",
          select: "preferredName technicianName companyName email",
        },
      ]);

      uploadedDocuments.push(document);
    }

    return sendSuccess(
      res,
      "Vendor documents uploaded successfully",
      { documents: uploadedDocuments },
      201,
    );
  } catch (err) {
    console.error("Error uploading vendor documents:", err);

    if (req.files) {
      req.files.forEach((file) => {
        try {
          fs.unlinkSync(file.path);
        } catch (unlinkErr) {}
      });
    }

    return sendError(
      res,
      err.message || "Failed to upload vendor documents",
      500,
    );
  }
};

// Get all documents with filtering
exports.getDocuments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const {
      search,
      building,
      portfolio,
      fileType,
      category,
      startDate,
      endDate,
    } = req.query;

    let filter = {};

    // Building filter
    if (building && building !== "All") filter.building = building;

    // Portfolio filter
    if (portfolio && portfolio !== "All") filter.portfolio = portfolio;

    // File type filter
    if (fileType && fileType !== "All") filter.fileType = fileType;

    // Category filter
    if (category && category !== "All") filter.category = category;

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = endOfDay;
      }
    }

    // Global search
    if (search && search.trim() !== "") {
      const regex = new RegExp(search, "i");
      filter.$or = [
        { fileName: regex },
        { description: regex },
        { originalFileName: regex },
      ];
    }

    // Fetch documents with pagination
    const [documents, total] = await Promise.all([
      Document.find(filter)
        .populate("category", "name")
        .populate(
          "uploadedBy",
          "preferredName technicianName companyName email",
        )
        .populate("building", "buildingAbbreviation formData.address")
        .populate("portfolio", "portfolioAbbreviation formData.name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Document.countDocuments(filter),
    ]);

    return sendSuccess(res, "Documents fetched successfully", {
      documents,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Error fetching documents:", err);
    return sendError(res, err.message || "Failed to fetch documents", 500);
  }
};

// Get documents by building
exports.getDocumentsByBuilding = async (req, res) => {
  try {
    const { buildingId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { fileType, category, startDate, endDate } = req.query;

    if (!buildingId) {
      return sendError(res, "Building ID is required", 400);
    }

    let filter = { building: buildingId };

    // File type filter
    if (fileType && fileType !== "All") filter.fileType = fileType;

    // Category filter
    if (category && category !== "All") filter.category = category;

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = endOfDay;
      }
    }

    const [documents, total] = await Promise.all([
      Document.find(filter)
        .populate("category", "name") // Populate category
        .populate(
          "uploadedBy",
          "preferredName technicianName companyName email",
        )
        .populate("building", "buildingAbbreviation formData.address")
        .populate("portfolio", "portfolioAbbreviation formData.name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Document.countDocuments(filter),
    ]);

    return sendSuccess(res, "Documents fetched successfully", {
      documents,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Error fetching documents by building:", err);
    return sendError(
      res,
      err.message || "Failed to fetch documents by building",
      500,
    );
  }
};

// Get documents by portfolio
exports.getDocumentsByPortfolio = async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { fileType, category, startDate, endDate } = req.query;

    if (!portfolioId) {
      return sendError(res, "Portfolio ID is required", 400);
    }

    let filter = { portfolio: portfolioId };

    // File type filter
    if (fileType && fileType !== "All") filter.fileType = fileType;

    // Category filter
    if (category && category !== "All") filter.category = category;

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = endOfDay;
      }
    }

    const [documents, total] = await Promise.all([
      Document.find(filter)
        .populate("category", "name")
        .populate("uploadedBy", "preferredName email")
        .populate("building", "buildingAbbreviation formData.address")
        .populate("portfolio", "portfolioAbbreviation formData.name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Document.countDocuments(filter),
    ]);

    return sendSuccess(res, "Documents fetched successfully", {
      documents,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Error fetching documents by portfolio:", err);
    return sendError(
      res,
      err.message || "Failed to fetch documents by portfolio",
      500,
    );
  }
};

// Get Documents by Work Order
exports.getDocumentsByWorkOrder = async (req, res) => {
  try {
    const { workOrderId } = req.params;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { category, startDate, endDate } = req.query;

    let filter = { workOrder: workOrderId };

    // Category filter
    if (category && category !== "All") {
      filter.category = category;
    }

    // Date filter
    if (startDate || endDate) {
      filter.createdAt = {};

      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }

      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = endOfDay;
      }
    }

    const [documents, total] = await Promise.all([
      Document.find(filter)
        .populate("category", "name")
        .populate(
          "uploadedBy",
          "preferredName technicianName companyName email",
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(
          "fileName description fileType mimeType fileUrl category uploadedBy createdAt",
        ),

      Document.countDocuments(filter),
    ]);

    return sendSuccess(res, "Work order documents fetched", {
      documents,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Error fetching work order documents:", err);
    return sendError(res, err.message || "Failed to fetch documents", 500);
  }
};

// Get Documents by Entity (workOrder, serviceAgreement, inspectionRequest, task, todo, company)
exports.getDocumentsByEntity = async (req, res) => {
  try {
    const { sourceType, sourceId } = req.params;

    if (!NOTE_SOURCE_TYPES.includes(sourceType)) {
      return sendError(res, "Invalid sourceType", 400);
    }
    if (!mongoose.isValidObjectId(sourceId)) {
      return sendError(res, "Invalid sourceId", 400);
    }
    // This route allows Vendors; company documents are internal only
    if (sourceType === "company" && req.user.role === "Vendor") {
      return sendError(res, "You are not allowed to view these documents", 403);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const { category, startDate, endDate, origin } = req.query;

    // ── Scope ──────────────────────────────────────────────────────────
    // company: documents attached directly to the company, PLUS documents
    let filter;
    if (sourceType === "workOrder") {
      filter = { $or: [{ workOrder: sourceId }, { sourceType, sourceId }] };
    } else if (sourceType === "company") {
      const own = { sourceType, sourceId };
      const linked = { company: sourceId };
      if (origin === "own") filter = own;
      else if (origin === "linked") filter = linked;
      else filter = { $or: [own, linked] };
    } else {
      filter = { sourceType, sourceId };
    }

    if (category && category !== "All") filter.category = category;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    const [documents, total] = await Promise.all([
      Document.find(filter)
        .populate("category", "name")
        .populate(
          "uploadedBy",
          "preferredName technicianName companyName email",
        )
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select(
          "fileName description fileType mimeType fileUrl category uploadedBy createdAt sourceType sourceId company workOrder",
        ),
      Document.countDocuments(filter),
    ]);

    return sendSuccess(res, "Documents fetched successfully", {
      documents,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch documents", 500);
  }
};

// Get single document by ID
exports.getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;

    const document = await Document.findById(id)
      .populate("category", "name") // Populate category
      .populate("uploadedBy", "preferredName email")
      .populate("building", "buildingAbbreviation formData.address")
      .populate("portfolio", "portfolioAbbreviation formData.name");

    if (!document) {
      return sendError(res, "Document not found", 404);
    }

    return sendSuccess(res, "Document fetched successfully", { document });
  } catch (err) {
    console.error("Error fetching document:", err);
    return sendError(res, err.message || "Failed to fetch document", 500);
  }
};

// Update document metadata (fileName, description)
exports.updateDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { fileName, description, category, building, portfolio } = req.body;

    const document = await Document.findById(id);
    if (!document) {
      return sendError(res, "Document not found", 404);
    }

    // Update category
    if (category !== undefined) {
      if (!category) {
        return sendError(res, "Category is required", 400);
      }

      const categoryExists = await NoteCategory.findById(category);
      if (!categoryExists) {
        return sendError(res, "Category not found", 404);
      }
      document.category = category;
    }

    // Update building if provided
    if (building !== undefined) {
      if (building) {
        const buildingExists = await Building.findById(building);
        if (!buildingExists) {
          return sendError(res, "Building not found", 404);
        }
      }
      document.building = building || null;
    }

    // Update portfolio if provided
    if (portfolio !== undefined) {
      if (portfolio) {
        const portfolioExists = await Portfolio.findById(portfolio);
        if (!portfolioExists) {
          return sendError(res, "Portfolio not found", 404);
        }
      }
      document.portfolio = portfolio || null;
    }

    // Update fields
    if (fileName) document.fileName = fileName.trim();
    if (description !== undefined) document.description = description.trim();

    await document.save();

    // Populate updated document
    await document.populate([
      { path: "category", select: "name" },
      { path: "uploadedBy", select: "preferredName email" },
      { path: "building", select: "buildingAbbreviation formData.address" },
      { path: "portfolio", select: "portfolioAbbreviation formData.name" },
    ]);

    return sendSuccess(res, "Document updated successfully", { document });
  } catch (err) {
    console.error("Error updating document:", err);
    return sendError(res, err.message || "Failed to update document", 500);
  }
};

// Delete document
exports.deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const document = await Document.findById(id).populate(
      "workOrder",
      "vendor",
    );
    if (!document) {
      return sendError(res, "Document not found", 404);
    }

    if (userRole === "Vendor") {
      try {
        await assertVendorCanAccessDocument(document, userId);
      } catch (guardErr) {
        return sendError(
          res,
          "Deletion is not allowed because this document was not uploaded by you.",
          guardErr.statusCode || 403,
        );
      }
    }

    await deleteFile(document.fileUrl);
    await document.deleteOne();

    return sendSuccess(res, "Document deleted successfully");
  } catch (err) {
    console.error("Error deleting document:", err);
    return sendError(res, err.message || "Failed to delete document", 500);
  }
};

// Get a short-lived, viewable URL for a document (used for preview/open-in-new-tab)
exports.getDocumentViewUrl = async (req, res) => {
  try {
    const { id } = req.params;

    const document = await Document.findById(id).populate(
      "workOrder",
      "vendor",
    );
    if (!document) {
      return sendError(res, "Document not found", 404);
    }

    if (req.user.role === "Vendor") {
      try {
        await assertVendorCanAccessDocument(document, req.user._id);
      } catch (guardErr) {
        return sendError(
          res,
          guardErr.message || "You do not have access to this document",
          guardErr.statusCode || 403,
        );
      }
    }

    // Owners: only published documents inside their own portfolios/buildings
    if (
      req.user.role === "Owner" &&
      !(await ownerCanAccessDocument(document, req.user._id))
    ) {
      return sendError(res, "Document not found", 404);
    }

    const url = await getFileViewUrl(document.fileUrl);

    return sendSuccess(res, "Document view URL generated", {
      url,
      fileName: document.fileName,
      fileType: document.fileType,
      mimeType: document.mimeType,
    });
  } catch (err) {
    console.error("Error generating document view URL:", err);
    return sendError(res, err.message || "Failed to generate view URL", 500);
  }
};

// Download document
exports.downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const document = await Document.findById(id);
    if (!document) {
      return sendError(res, "Document not found", 404);
    }

    if (req.user.role === "Vendor") {
      try {
        await assertVendorCanAccessDocument(document, req.user._id);
      } catch (guardErr) {
        return sendError(
          res,
          guardErr.message || "You do not have access to this document",
          guardErr.statusCode || 403,
        );
      }
    }

    if (
      req.user.role === "Owner" &&
      !(await ownerCanAccessDocument(document, req.user._id))
    ) {
      return sendError(res, "Document not found", 404);
    }

    if (!fileExists(document.fileUrl)) {
      return sendError(res, "File not found on server", 404);
    }

    res.setHeader(
      "Content-Type",
      document.mimeType || "application/octet-stream",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(document.fileName)}"`,
    );
    res.setHeader("Content-Transfer-Encoding", "binary");
    res.setHeader("Accept-Ranges", "bytes");

    // Pipe stream safely
    const stream = getFileStream(document.fileUrl);

    stream.on("error", (err) => {
      console.error("Stream error:", err);
      return sendError(res, "Error reading file", 500);
    });

    stream.pipe(res);
  } catch (err) {
    console.error("Error downloading document:", err);
    return sendError(res, err.message || "Failed to download document", 500);
  }
};

// ========================= Owner Portal =========================
const OWNER_DOC_FIELDS =
  "fileName description fileType mimeType fileSize category building portfolio createdAt publishedToOwnerAt";
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const buildingLabel = (b) =>
  [
    b.formData?.address || b.buildingAbbreviation || "Address not set",
    b.unitNumber ? `Unit ${b.unitNumber}` : null,
  ]
    .filter(Boolean)
    .join(" - ");

// Internal: publish / unpublish a document to the Owner Portal
exports.setDocumentOwnerVisibility = async (req, res) => {
  try {
    const { id } = req.params;
    const { published } = req.body || {};

    if (!mongoose.isValidObjectId(id)) {
      return sendError(res, "Invalid document id", 400);
    }
    if (typeof published !== "boolean") {
      return sendError(res, "published must be true or false", 400);
    }

    const doc = await Document.findById(id)
      .select("fileName portfolio building publishedToOwner")
      .lean();
    if (!doc) return sendError(res, "Document not found", 404);

    if (published && !doc.portfolio && !doc.building) {
      return sendError(
        res,
        "Only documents attached to a portfolio or building can be published to owners",
        400,
      );
    }

    // Atomic + idempotent: only flips if it isn't already in that state
    const updated = await Document.findOneAndUpdate(
      { _id: id, publishedToOwner: published ? { $ne: true } : true },
      {
        $set: published
          ? {
              publishedToOwner: true,
              publishedToOwnerAt: new Date(),
              publishedToOwnerBy: req.user._id,
            }
          : {
              publishedToOwner: false,
              publishedToOwnerAt: null,
              publishedToOwnerBy: null,
            },
      },
      { new: true },
    )
      .select("fileName portfolio building publishedToOwner publishedToOwnerAt")
      .lean();

    if (!updated) {
      return sendSuccess(res, "No change needed", {
        document: { _id: doc._id, publishedToOwner: published },
      });
    }

    // Shows in the portfolio/building Audit Summary; never fails the request
    const auditTarget = updated.portfolio
      ? { entityType: "portfolio", entityId: updated.portfolio }
      : updated.building
        ? { entityType: "building", entityId: updated.building }
        : null;
    if (auditTarget) {
      AuditService.logActivity({
        ...auditTarget,
        action: "updated",
        actionDetails: `Document "${updated.fileName}" ${
          published ? "published to" : "removed from"
        } Owner Portal`,
        changes: [
          {
            field: "publishedToOwner",
            oldValue: !published,
            newValue: published,
          },
        ],
        performedBy: req.user._id,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      }).catch((e) => console.error("Owner publish audit failed:", e));
    }

    return sendSuccess(
      res,
      published
        ? "Document published to Owner Portal"
        : "Document removed from Owner Portal",
      { document: updated },
    );
  } catch (err) {
    console.error("Error updating owner visibility:", err);
    return sendError(res, "Failed to update Owner Portal visibility", 500);
  }
};

// Owner: published documents for the owner's portfolios, buildings and units
exports.getOwnerDocuments = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      100,
    );
    const { portfolioId, buildingId, category, startDate, endDate, search } =
      req.query;

    // Whitelisted sorting (default: newest first)
    const SORT_FIELDS = {
      fileName: "fileName",
      uploadDate: "createdAt",
      createdAt: "createdAt",
    };
    const sortField = SORT_FIELDS[req.query.sortBy] || "createdAt";
    const sortDir = req.query.sortBy
      ? req.query.sortOrder === "desc"
        ? -1
        : 1
      : -1;

    const { portfolios, portfolioIds, buildingIds, buildings } =
      await getOwnerDocumentScope(req.user._id);

    if (!portfolioIds.length) {
      return sendSuccess(res, "Documents fetched successfully", {
        documents: [],
        total: 0,
        page,
        pages: 0,
        portfolios: [],
        buildings: [],
        categories: [],
      });
    }

    const scope = {
      publishedToOwner: true,
      $or: [
        { portfolio: { $in: portfolioIds } },
        { building: { $in: buildingIds } },
      ],
    };
    const filter = { ...scope };

    // Portfolio filter: only one of the owner's own portfolios
    if (portfolioId && portfolioId !== "All") {
      const pid = String(portfolioId);
      const inScope = portfolioIds.some((id) => String(id) === pid);
      const pBuildingIds = buildings
        .filter((b) => String(b.ownerPortfolioId) === pid)
        .map((b) => b._id);
      filter.$or = inScope
        ? [{ portfolio: pid }, { building: { $in: pBuildingIds } }]
        : [{ _id: null }]; // not theirs → nothing
    }

    // Building filter can only narrow, never widen, the owner's scope
    if (buildingId && buildingId !== "All") {
      const selected = buildings
        .filter(
          (b) =>
            String(b._id) === String(buildingId) ||
            String(b.parentBuilding) === String(buildingId),
        )
        .map((b) => b._id);
      delete filter.$or;
      filter.building = { $in: selected };
    }

    if (category && category !== "All") {
      if (!mongoose.isValidObjectId(category)) {
        return sendError(res, "Invalid category", 400);
      }
      filter.category = category;
    }

    if (startDate || endDate) {
      const range = {};
      const from = startDate ? new Date(startDate) : null;
      const to = endDate ? new Date(endDate) : null;
      if (from && !isNaN(from)) range.$gte = from;
      if (to && !isNaN(to)) {
        to.setHours(23, 59, 59, 999);
        range.$lte = to;
      }
      if (Object.keys(range).length) filter.createdAt = range;
    }

    const term = typeof search === "string" ? search.trim().slice(0, 100) : "";
    if (term) {
      const rx = new RegExp(escapeRegex(term), "i");
      filter.$and = [{ $or: [{ fileName: rx }, { description: rx }] }];
    }

    const [documents, total, categoryIds] = await Promise.all([
      Document.find(filter)
        .select(OWNER_DOC_FIELDS) // fileUrl / uploader are never sent to owners
        .populate("category", "name")
        .populate(
          "building",
          "buildingAbbreviation unitNumber formData.address",
        )
        .populate("portfolio", "portfolioName portfolioAbbreviation")
        .collation({ locale: "en", strength: 2 }) // case-insensitive name sort
        .sort({ [sortField]: sortDir, _id: sortDir }) // _id = stable paging
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Document.countDocuments(filter),
      Document.distinct("category", scope),
    ]);

    const categories = categoryIds.length
      ? await NoteCategory.find({ _id: { $in: categoryIds } })
          .select("name")
          .sort({ name: 1 })
          .lean()
      : [];

    // Building-only documents still need their portfolio for the filter
    const buildingPortfolio = new Map(
      buildings.map((b) => [String(b._id), b.ownerPortfolioId]),
    );
    const byLabel = (a, b) => a.label.localeCompare(b.label);

    return sendSuccess(res, "Documents fetched successfully", {
      documents: documents.map((d) => ({
        ...d,
        portfolioId:
          d.portfolio?._id ||
          buildingPortfolio.get(String(d.building?._id)) ||
          null,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
      portfolios: portfolios
        .map((p) => ({
          _id: p._id,
          label: p.portfolioName || p.portfolioAbbreviation || "Portfolio",
        }))
        .sort(byLabel),
      buildings: buildings
        .map((b) => ({
          _id: b._id,
          label: buildingLabel(b),
          portfolioId: b.ownerPortfolioId,
        }))
        .sort(byLabel),
      categories,
    });
  } catch (err) {
    console.error("Error fetching owner documents:", err);
    return sendError(res, "Failed to fetch documents", 500);
  }
};

// ========================= Owner Portal: upload =========================
const OWNER_UPLOAD_CATEGORY = "Provided by Owner"; // rename here if the client wants another label
const OWNER_ALLOWED_TYPES = ["pdf", "image", "video", "word", "excel"];
const MAX_OWNER_FILE_NAME = 200;
const MAX_OWNER_DESCRIPTION = 500;

const removeTempFiles = (files = []) =>
  files.forEach((f) => {
    try {
      if (f?.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
    } catch {}
  });

const cleanText = (v, max) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

// Find-or-create; safe if two uploads create it at the same moment
const getOwnerUploadCategoryId = async () => {
  const find = () =>
    NoteCategory.findOne({ name: OWNER_UPLOAD_CATEGORY }).select("_id").lean();

  const existing = await find();
  if (existing) return existing._id;
  try {
    const created = await NoteCategory.create({ name: OWNER_UPLOAD_CATEGORY });
    return created._id;
  } catch (err) {
    if (err.code === 11000) return (await find())._id; // created by a parallel request
    throw err;
  }
};

// Owner: upload documents / images / videos — each file to one of their portfolios
exports.ownerUploadDocuments = async (req, res) => {
  const files = req.files || [];
  const storedUrls = [];

  try {
    if (!files.length) {
      return sendError(res, "Please select at least one file", 400);
    }

    // Only the owner's ACTIVE portfolios
    const ownerPortfolios = await Portfolio.find({
      owners: req.user._id,
      status: { $ne: "Deactivated" },
    })
      .select("_id portfolioName")
      .lean();

    if (!ownerPortfolios.length) {
      removeTempFiles(files);
      return sendError(res, "You are not linked to any active portfolio", 403);
    }

    // Documents, images and videos only
    const blocked = files.find(
      (f) => !OWNER_ALLOWED_TYPES.includes(getFileType(f.mimetype)),
    );
    if (blocked) {
      removeTempFiles(files);
      return sendError(
        res,
        `"${blocked.originalname}" isn't supported. Please upload documents, images or videos.`,
        400,
      );
    }

    let meta = [];
    try {
      meta = JSON.parse(req.body?.documents || "[]");
    } catch {
      meta = [];
    }
    if (!Array.isArray(meta)) meta = [];

    // Each file's portfolio must be one of the owner's (one portfolio → used by default)
    const portfolioById = new Map(
      ownerPortfolios.map((p) => [String(p._id), p]),
    );
    const fallback =
      ownerPortfolios.length === 1 ? String(ownerPortfolios[0]._id) : "";
    const targets = files.map((_, i) =>
      portfolioById.get(String(meta[i]?.portfolio || fallback)),
    );

    const missing = targets.findIndex((t) => !t);
    if (missing !== -1) {
      removeTempFiles(files);
      return meta[missing]?.portfolio
        ? sendError(res, "You can only upload to your own portfolios", 403)
        : sendError(
            res,
            `Please select a portfolio for "${files[missing].originalname}"`,
            400,
          );
    }

    const categoryId = await getOwnerUploadCategoryId();

    // Store every file first; if anything fails, the catch removes them all
    for (const file of files) {
      storedUrls.push(await uploadFile(file, "uploads/documents"));
    }

    const now = new Date();
    const docs = await Document.insertMany(
      files.map((file, i) => ({
        fileName:
          cleanText(meta[i]?.fileName, MAX_OWNER_FILE_NAME) ||
          file.originalname,
        originalFileName: file.originalname,
        description: cleanText(meta[i]?.description, MAX_OWNER_DESCRIPTION),
        category: categoryId, // server decides — never sent by the owner
        fileType: getFileType(file.mimetype),
        mimeType: file.mimetype,
        fileSize: file.size,
        fileUrl: storedUrls[i],
        portfolio: targets[i]._id, // shows in that Portfolio → Notes & Docs
        building: null,
        uploadedBy: req.user._id,
        publishedToOwner: true,
        publishedToOwnerAt: now,
        publishedToOwnerBy: req.user._id,
      })),
    );

    // One audit entry per portfolio
    const namesByPortfolio = new Map();
    docs.forEach((d) => {
      const key = String(d.portfolio);
      namesByPortfolio.set(key, [
        ...(namesByPortfolio.get(key) || []),
        d.fileName,
      ]);
    });
    namesByPortfolio.forEach((names, portfolioId) => {
      AuditService.logActivity({
        entityType: "portfolio",
        entityId: portfolioId,
        action: "updated",
        actionDetails: `Owner uploaded ${names.length} document(s): ${names.join(", ")}`,
        performedBy: req.user._id,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      }).catch((e) => console.error("Owner upload audit failed:", e));
    });

    const message =
      namesByPortfolio.size === 1
        ? `${docs.length} document(s) uploaded to ${targets[0].portfolioName}`
        : `${docs.length} documents uploaded to ${namesByPortfolio.size} portfolios`;

    return sendSuccess(
      res,
      message,
      { documents: docs.map((d) => ({ _id: d._id, fileName: d.fileName })) },
      201,
    );
  } catch (err) {
    console.error("Error uploading owner documents:", err);
    removeTempFiles(files);
    storedUrls.forEach((url) =>
      Promise.resolve()
        .then(() => deleteFile(url))
        .catch(() => {}),
    );
    if (err.name === "ValidationError") {
      return sendError(res, "One or more files couldn't be saved", 400);
    }
    return sendError(res, "Failed to upload documents", 500);
  }
};
