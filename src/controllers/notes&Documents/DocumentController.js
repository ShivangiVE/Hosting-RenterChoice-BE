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
} = require("../../utils/storageService");
const WorkOrder = require("../../models/WorkOrder");

// Helper function to determine file type from mime type
const getFileType = (mimeType) => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType === "application/vnd.ms-excel" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "excel";
  }
  if (
    mimeType === "application/msword" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "word";
  }
  return "other";
};

// Upload multiple documents
exports.uploadDocuments = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return sendError(res, "No files uploaded", 400);
    }

    const { building, portfolio, documents } = req.body;

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
      201
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
        403
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
        403
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
        400
      );
    }

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
      201
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
      500
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
          "preferredName technicianName companyName email"
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
          "preferredName technicianName companyName email"
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
      500
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
      500
    );
  }
};

// Get Documents by Work Order
exports.getDocumentsByWorkOrder = async (req, res) => {
  try {
    const { workOrderId } = req.params;

    // Validate Work Order
    const workOrder = await WorkOrder.findById(workOrderId);
    if (!workOrder) {
      return sendError(res, "Work Order not found", 404);
    }

    // Fetch documents linked ONLY to this work order
    const documents = await Document.find({ workOrder: workOrderId })
      .populate("category", "name")
      .populate("uploadedBy", "preferredName technicianName companyName email")
      .populate("building", "buildingAbbreviation formData.address")
      .populate("portfolio", "portfolioAbbreviation formData.name")
      .sort({ createdAt: -1 });

    return sendSuccess(
      res,
      "Work order documents fetched successfully",
      documents
    );
  } catch (err) {
    console.error("Error fetching work order documents:", err);
    return sendError(
      res,
      err.message || "Failed to fetch work order documents",
      500
    );
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

    const document = await Document.findById(id);
    if (!document) {
      return sendError(res, "Document not found", 404);
    }

    // Delete the physical file
    await deleteFile(document.fileUrl);

    await document.deleteOne();

    return sendSuccess(res, "Document deleted successfully");
  } catch (err) {
    console.error("Error deleting document:", err);
    return sendError(res, err.message || "Failed to delete document", 500);
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

    if (!fileExists(document.fileUrl)) {
      return sendError(res, "File not found on server", 404);
    }

    res.setHeader(
      "Content-Type",
      document.mimeType || "application/octet-stream"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(document.fileName)}"`
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
