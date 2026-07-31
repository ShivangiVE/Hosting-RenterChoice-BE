const Note = require("../../models/Notes&Documents/Note");
const NoteCategory = require("../../models/Notes&Documents/NoteCategory");
const Building = require("../../models/Building");
const Portfolio = require("../../models/Portfolio");
const { sendSuccess, sendError } = require("../../utils/response");
const WorkOrder = require("../../models/WorkOrder");
const { getVendorEntityConfig } = require("../../utils/vendorEntityRegistry");

// Create Note
exports.createNote = async (req, res) => {
  try {
    if (req.user.role === "Vendor") {
      return sendError(
        res,
        "Vendors cannot create notes using this endpoint",
        403,
      );
    }

    const {
      subject,
      description,
      category,
      building,
      portfolio,
      sourceType,
      sourceId,
      workOrder,
    } = req.body;

    // Validation
    if (!subject || !subject.trim()) {
      return sendError(res, "Subject is required", 400);
    }
    if (!description || !description.trim()) {
      return sendError(res, "Description is required", 400);
    }
    if (!category) {
      return sendError(res, "Category is required", 400);
    }

    // Check if category exists
    const categoryExists = await NoteCategory.findById(category);
    if (!categoryExists) {
      return sendError(res, "Category not found", 404);
    }

    // Validate building if provided
    if (building) {
      const buildingExists = await Building.findById(building);
      if (!buildingExists) {
        return sendError(res, "Building not found", 404);
      }
    }

    // Validate portfolio if provided
    if (portfolio) {
      const portfolioExists = await Portfolio.findById(portfolio);
      if (!portfolioExists) {
        return sendError(res, "Portfolio not found", 404);
      }
    }

    // Validate Work order if provided
    if (workOrder) {
      const workOrderExists = await WorkOrder.findById(workOrder);
      if (!workOrderExists) {
        return sendError(res, "Work order not found", 404);
      }
    }

    const note = await Note.create({
      subject: subject.trim(),
      description: description.trim(),
      category,
      building: building || null,
      portfolio: portfolio || null,
      workOrder: sourceType === "workOrder" ? sourceId || workOrder : null,
      sourceType: sourceType || (workOrder ? "workOrder" : undefined),
      sourceId: sourceId || workOrder || undefined,
      createdBy: req.user._id,
    });

    // Populate the created note with all details
    await note.populate([
      { path: "category", select: "name" },
      { path: "createdBy", select: "preferredName email" },
      { path: "building", select: "buildingAbbreviation formData.address" },
      { path: "portfolio", select: "portfolioAbbreviation formData.name" },
      { path: "workOrder", select: "workOrderNumber" },
    ]);

    return sendSuccess(res, "Note created successfully", { note }, 201);
  } catch (err) {
    console.error("Error creating note:", err);
    return sendError(res, err.message || "Failed to create note", 500);
  }
};

// Create Note by Internal Team for Work Order
exports.internalCreateNoteForWorkOrder = async (req, res) => {
  try {
    const { workOrderId } = req.params;
    const { subject, description, category } = req.body;

    // Validation
    if (!subject || !subject.trim()) {
      return sendError(res, "Subject is required", 400);
    }

    if (!description || !description.trim()) {
      return sendError(res, "Description is required", 400);
    }

    if (!category) {
      return sendError(res, "Category is required", 400);
    }

    // Check Work Order exists
    const workOrder = await WorkOrder.findById(workOrderId);
    if (!workOrder) {
      return sendError(res, "Work order not found", 404);
    }

    // Check category exists
    const categoryExists = await NoteCategory.findById(category);
    if (!categoryExists) {
      return sendError(res, "Category not found", 404);
    }

    // Create note
    const note = await Note.create({
      subject: subject.trim(),
      description: description.trim(),
      category,
      workOrder: workOrderId,
      building: workOrder.building || null,
      portfolio: workOrder.portfolio || null,
      createdBy: req.user._id,
    });

    // Populate response
    await note.populate([
      { path: "category", select: "name" },
      {
        path: "createdBy",
        select: "preferredName technicianName companyName email",
      },
    ]);

    return sendSuccess(res, "Note added to work order", { note }, 201);
  } catch (err) {
    console.error("Internal work order note error:", err);
    return sendError(res, err.message || "Failed to add note", 500);
  }
};

// Create Note by Vendor
exports.vendorCreateNote = async (req, res) => {
  try {
    const { workOrderId } = req.params;
    const { description } = req.body;
    const vendorId = req.user._id;

    // Validate
    if (!description || !description.trim()) {
      return sendError(res, "Description is required", 400);
    }

    const workOrder = await WorkOrder.findOne({
      _id: workOrderId,
      vendor: vendorId,
    })
      .populate("building")
      .populate("dynamicStatus", "name");

    if (!workOrder) {
      return sendError(
        res,
        "You are not allowed to add notes for this work order",
        403,
      );
    }

    if (workOrder.dynamicStatus?.name === "Declined") {
      return sendError(
        res,
        "You cannot add notes because this work order is Declined",
        403,
      );
    }

    //  Check if a Vendor category exists (case-insensitive)
    let vendorCategory = await NoteCategory.findOne({
      name: { $regex: /^vendor$/i },
    });

    // If not found → auto-create default Vendor category
    if (!vendorCategory) {
      vendorCategory = await NoteCategory.create({
        name: "Vendor",
        createdBy: vendorId,
      });
    }

    const finalCategory = vendorCategory._id;

    // Subject is generated on server
    const subject = "Message from Vendor";

    const note = await Note.create({
      subject,
      description,
      category: finalCategory,
      workOrder: workOrder._id,
      createdBy: vendorId,
    });

    return sendSuccess(res, "Vendor note created successfully", { note });
  } catch (err) {
    console.error("Vendor note creation failed:", err);
    return sendError(res, "Failed to create vendor note", 500);
  }
};

// Generic: Create Note by Vendor for any registered entity type
exports.vendorCreateNoteForEntity = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { description } = req.body;
    const vendorId = req.user._id;

    const config = getVendorEntityConfig(entityType);
    if (!config) {
      return sendError(res, `Unsupported entity type: ${entityType}`, 400);
    }

    if (!description || !description.trim()) {
      return sendError(res, "Description is required", 400);
    }

    let query = config.model.findOne({ _id: entityId, vendor: vendorId });
    config.populate.forEach((p) => (query = query.populate(p)));
    const entity = await query;

    if (!entity) {
      return sendError(
        res,
        `You are not allowed to add notes for this ${config.label}`,
        403,
      );
    }

    if (config.isDeclined(entity)) {
      return sendError(
        res,
        `You cannot add notes because this ${config.label} is Declined`,
        403,
      );
    }

    let vendorCategory = await NoteCategory.findOne({
      name: { $regex: /^vendor$/i },
    });
    if (!vendorCategory) {
      vendorCategory = await NoteCategory.create({
        name: "Vendor",
        createdBy: vendorId,
      });
    }

    const note = await Note.create({
      subject: "Message from Vendor",
      description,
      category: vendorCategory._id,
      ...(config.linkField ? { [config.linkField]: entity._id } : {}),
      sourceType: entityType,
      sourceId: entity._id,
      createdBy: vendorId,
    });

    return sendSuccess(res, "Vendor note created successfully", { note });
  } catch (err) {
    console.error("Vendor note creation failed:", err);
    return sendError(res, "Failed to create vendor note", 500);
  }
};

// Get All Notes with filtering by building/portfolio
exports.getNotes = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { category, search, building, portfolio, startDate, endDate } =
      req.query;

    let filter = {};

    // Category filter
    if (category && category !== "All") filter.category = category;

    // Building filter
    if (building && building !== "All") filter.building = building;

    // Portfolio filter
    if (portfolio && portfolio !== "All") filter.portfolio = portfolio;

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        // Set end date to end of day for inclusive range
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = endOfDay;
      }
    }

    // Global search
    if (search && search.trim() !== "") {
      const regex = new RegExp(search, "i");
      filter.$or = [{ subject: regex }, { description: regex }];
    }

    // Fetch notes with pagination
    const [notes, total] = await Promise.all([
      Note.find(filter)
        .populate("category", "name")
        .populate("createdBy", "preferredName technicianName companyName email")
        .populate("building", "buildingAbbreviation formData.address")
        .populate("portfolio", "portfolioAbbreviation formData.name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Note.countDocuments(filter),
    ]);

    return sendSuccess(res, "Notes fetched successfully", {
      notes,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Error fetching notes:", err);
    return sendError(res, err.message || "Failed to fetch notes", 500);
  }
};

// Get Notes by Building
exports.getNotesByBuilding = async (req, res) => {
  try {
    const { buildingId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { category, startDate, endDate } = req.query;

    if (!buildingId) {
      return sendError(res, "Building ID is required", 400);
    }

    let filter = { building: buildingId };

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

    // Fetch notes
    const [notes, total] = await Promise.all([
      Note.find(filter)
        .populate("category", "name")
        .populate("createdBy", "preferredName email")
        .populate("building", "buildingAbbreviation formData.address")
        .populate("portfolio", "portfolioAbbreviation formData.name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Note.countDocuments(filter),
    ]);

    return sendSuccess(res, "Notes fetched successfully", {
      notes,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Error fetching notes by building:", err);
    return sendError(
      res,
      err.message || "Failed to fetch notes by building",
      500,
    );
  }
};

// Get Notes by Portfolio
exports.getNotesByPortfolio = async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { category, startDate, endDate } = req.query;

    if (!portfolioId) {
      return sendError(res, "Portfolio ID is required", 400);
    }

    let filter = { portfolio: portfolioId };

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

    // Fetch notes
    const [notes, total] = await Promise.all([
      Note.find(filter)
        .populate("category", "name")
        .populate("createdBy", "preferredName email")
        .populate("building", "buildingAbbreviation formData.address")
        .populate("portfolio", "portfolioAbbreviation formData.name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Note.countDocuments(filter),
    ]);

    return sendSuccess(res, "Notes fetched successfully", {
      notes,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Error fetching notes by portfolio:", err);
    return sendError(
      res,
      err.message || "Failed to fetch notes by portfolio",
      500,
    );
  }
};

// Get Notes by Work Order
exports.getNotesByWorkOrder = async (req, res) => {
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

    const [notes, total] = await Promise.all([
      Note.find(filter)
        .populate("category", "name")
        .populate("createdBy", "preferredName technicianName companyName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(
          "subject description category createdBy building portfolio workOrder createdAt",
        ),

      Note.countDocuments(filter),
    ]);

    return sendSuccess(res, "Work order notes fetched", {
      notes,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Error fetching work order notes:", err);
    return sendError(res, err.message || "Failed to fetch notes", 500);
  }
};

// Get Notes by Entity (Service Agreement/Inspection Request/work order)
exports.getNotesByEntity = async (req, res) => {
  try {
    const { sourceType, sourceId } = req.params;
    const VALID_TYPES = [
      "workOrder",
      "serviceAgreement",
      "inspectionRequest",
      "task",
      "todo",
    ];

    if (!VALID_TYPES.includes(sourceType)) {
      return sendError(res, "Invalid sourceType", 400);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const { category, startDate, endDate } = req.query;

    // Support BOTH old workOrder field and new polymorphic fields
    const filter =
      sourceType === "workOrder"
        ? { $or: [{ workOrder: sourceId }, { sourceType, sourceId }] }
        : { sourceType, sourceId };

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

    const [notes, total] = await Promise.all([
      Note.find(filter)
        .populate("category", "name")
        .populate("createdBy", "preferredName email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Note.countDocuments(filter),
    ]);

    return sendSuccess(res, "Notes fetched successfully", {
      notes,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch notes", 500);
  }
};

// Get Single Note by ID
exports.getNoteById = async (req, res) => {
  try {
    const { id } = req.params;

    const note = await Note.findById(id)
      .populate("category", "name")
      .populate("createdBy", "preferredName technicianName companyName email")
      .populate("building", "buildingAbbreviation formData.address")
      .populate("portfolio", "portfolioAbbreviation formData.name");

    if (!note) {
      return sendError(res, "Note not found", 404);
    }

    return sendSuccess(res, "Note fetched successfully", { note });
  } catch (err) {
    console.error("Error fetching note:", err);
    return sendError(res, err.message || "Failed to fetch note", 500);
  }
};

// Update Note
exports.updateNote = async (req, res) => {
  try {
    const { id } = req.params;

    const note = await Note.findById(id);
    if (!note) {
      return sendError(res, "Note not found", 404);
    }

    // AUTHORIZATION CHECK
    if (
      req.user.role === "Vendor" &&
      note.createdBy.toString() !== req.user._id.toString()
    ) {
      return sendError(res, "You are not allowed to edit this note", 403);
    }

    //  HARDENING: Vendors can update ONLY description
    if (req.user.role === "Vendor") {
      delete req.body.subject;
      delete req.body.category;
      delete req.body.building;
      delete req.body.portfolio;
    }

    const { subject, description, category, building, portfolio } = req.body;

    // Check if category exists (if being updated)
    if (category) {
      const categoryExists = await NoteCategory.findById(category);
      if (!categoryExists) {
        return sendError(res, "Category not found", 404);
      }
      note.category = category;
    }

    // Update building if provided
    if (building !== undefined) {
      if (building) {
        const buildingExists = await Building.findById(building);
        if (!buildingExists) {
          return sendError(res, "Building not found", 404);
        }
      }
      note.building = building || null;
    }

    // Update portfolio if provided
    if (portfolio !== undefined) {
      if (portfolio) {
        const portfolioExists = await Portfolio.findById(portfolio);
        if (!portfolioExists) {
          return sendError(res, "Portfolio not found", 404);
        }
      }
      note.portfolio = portfolio || null;
    }

    // Update fields
    if (subject) note.subject = subject.trim();
    if (description) note.description = description.trim();

    await note.save();

    // Populate updated note
    await note.populate([
      { path: "category", select: "name" },
      { path: "createdBy", select: "preferredName email" },
      { path: "building", select: "buildingAbbreviation formData.address" },
      { path: "portfolio", select: "portfolioAbbreviation formData.name" },
    ]);

    return sendSuccess(res, "Note updated successfully", { note });
  } catch (err) {
    console.error("Error updating note:", err);
    return sendError(res, err.message || "Failed to update note", 500);
  }
};

// Delete Note
exports.deleteNote = async (req, res) => {
  try {
    const { id } = req.params;

    const note = await Note.findById(id);
    if (!note) {
      return sendError(res, "Note not found", 404);
    }

    if (
      req.user.role === "Vendor" &&
      note.createdBy.toString() !== req.user._id.toString()
    ) {
      return sendError(res, "You are not allowed to delete this note", 403);
    }

    await note.deleteOne();

    return sendSuccess(res, "Note deleted successfully");
  } catch (err) {
    console.error("Error deleting note:", err);
    return sendError(res, err.message || "Failed to delete note", 500);
  }
};
