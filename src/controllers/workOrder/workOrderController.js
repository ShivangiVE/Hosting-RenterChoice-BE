const Building = require("../../models/Building");
const InspectionRequest = require("../../models/InspectionRequest");
const ServiceAgreement = require("../../models/ServiceAgreement");
const User = require("../../models/User");
const WorkOrder = require("../../models/WorkOrder");
const Counter = require("../../utils/Counter");
const { sendSuccess, sendError } = require("../../utils/response");

// Helper function to get next sequence number
const getNextSequence = async (sequenceName) => {
  const counter = await Counter.findByIdAndUpdate(
    sequenceName,
    { $inc: { sequence_value: 1 } },
    { new: true, upsert: true }
  );
  return counter.sequence_value;
};

// Peek next sequence number without incrementing
exports.getNextCounterValue = async (req, res) => {
  try {
    const { type } = req.params; // e.g., "workOrder", "inspection", "serviceAgreement"

    const counter = await Counter.findById(type);

    // If counter doesn't exist yet, start from 1
    const sequenceValue = counter ? counter.sequence_value : 0;

    // NEXT number should be current + 1
    const nextNumber = sequenceValue + 1;

    return sendSuccess(res, "Counter fetched successfully", {
      type,
      nextNumber,
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch counter", 500);
  }
};

// Create Work Order
exports.createWorkOrder = async (req, res) => {
  try {
    const {
      workOrderType,
      category,
      building,
      description,
      vendor,
      keyIssued,
      dueDate,
    } = req.body;

    // If a file was uploaded, build a public URL
    const fileUrl = req.file
      ? `/uploads/Repair/workOrders/${req.file.filename}`
      : null;
    // Generate work order number
    const sequence = await getNextSequence("workOrder");
    const workOrderNumber = `WO #${sequence.toString().padStart(4, "0")}`;

    // Normalize status to lowercase
    const normalizeStatus = (status) => {
      if (!status) return "open";
      const s = status.toLowerCase();
      if (s === "open") return "open";
      if (s === "closed") return "closed";
      return "open"; // fallback
    };

    const workOrder = await WorkOrder.create({
      workOrderNumber,
      workOrderType,
      category,
      building,
      description,
      vendor,
      keyIssued: keyIssued || false,
      dueDate,
      fileUrl,
      status: normalizeStatus(req.body.status),
      createdBy: req.user._id,
    });

    return sendSuccess(
      res,
      "Work order created successfully",
      { workOrder },
      201
    );
  } catch (err) {
    return sendError(res, err.message || "Failed to create work order", 500);
  }
};

// Get all work orders
exports.getWorkOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { status, category, vendor, building, portfolio, tenancy, search } =
      req.query;

    let filter = {};

    if (status && status !== "All") {
      filter.status = status;
    }

    if (category && category !== "All") {
      filter.category = category; // FE must send categoryId
    }

    if (vendor && vendor !== "All") {
      filter.vendor = vendor; // FE must send vendorId
    }

    if (building && building !== "All") {
      filter.building = building; // FE must send buildingId
    }

    if (portfolio && portfolio !== "All") {
      filter["building.portfolio"] = portfolio; // FE must send portfolioId
    }

    if (tenancy && tenancy !== "All") {
      filter.tenant = tenancy; // FE must send tenancyId/string
    }

    if (search) {
      const regex = new RegExp(search, "i");

      // Find buildings that match the search
      const buildingIds = await Building.find({
        $or: [
          { "formData.address": regex },
          { "formData.fullAddress": regex },
          { buildingAbbreviation: regex },
        ],
      }).distinct("_id");

      filter.$or = [
        { workOrderNumber: regex },
        { description: regex },
        { building: { $in: buildingIds } },
      ];
    }

    const workOrders = await WorkOrder.find(filter)
      .populate({
        path: "building",
        select: "buildingAbbreviation formData.address portfolio",
        populate: {
          path: "portfolio",
          select: "portfolioAbbreviation formData.name",
        },
      })
      .populate("vendor", "companyName technicianName")
      .populate("category", "name")
      .populate("createdBy", "preferredName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await WorkOrder.countDocuments(filter);

    return sendSuccess(res, "Work orders fetched successfully", {
      workOrders,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch work orders", 500);
  }
};

// Get single work order
exports.getWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const workOrder = await WorkOrder.findById(id)
      .populate({
        path: "building",
        select: "buildingAbbreviation formData.address portfolio",
        populate: {
          path: "portfolio",
          select: "portfolioAbbreviation formData.name",
        },
      })
      .populate("vendor", "companyName technicianName email")
      .populate("category", "name")
      .populate("createdBy", "preferredName email")
      .populate("assignedTo", "preferredName email");

    if (!workOrder) return sendError(res, "Work order not found", 404);

    return sendSuccess(res, "Work order fetched successfully", { workOrder });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch work order", 500);
  }
};

// Update Work Order
exports.updateWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const updateData = { ...req.body };

    // Handle new file upload (if provided)
    if (req.file) {
      updateData.fileUrl = `/uploads/Repair/workOrders/${req.file.filename}`;
    }

    const workOrder = await WorkOrder.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!workOrder) return sendError(res, "Work order not found", 404);

    return sendSuccess(res, "Work order updated successfully", { workOrder });
  } catch (err) {
    return sendError(res, err.message || "Failed to update work order", 500);
  }
};

// Delete Work Order
exports.deleteWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const workOrder = await WorkOrder.findByIdAndDelete(id);

    if (!workOrder) return sendError(res, "Work order not found", 404);

    return sendSuccess(res, "Work order deleted successfully", { workOrder });
  } catch (err) {
    return sendError(res, err.message || "Failed to delete work order", 500);
  }
};

// Close Work Order
exports.closeWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;

    const workOrder = await WorkOrder.findById(id);
    if (!workOrder) {
      return res
        .status(404)
        .json({ success: false, message: "Work order not found" });
    }

    workOrder.status = "closed";
    workOrder.completeDate = new Date();
    if (comments) {
      workOrder.closingComments = comments;
    }

    await workOrder.save();

    res.json({
      success: true,
      message: "Work order closed successfully",
      data: workOrder,
    });
  } catch (error) {
    console.error("Error closing work order:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Create Inspection Request
exports.createInspectionRequest = async (req, res) => {
  try {
    const {
      inspectionType,
      building,
      notes,
      assignedTo,
      keyIssued,
      dueDate,
      inspectionColour,
    } = req.body;

    // Generate inspection number
    const sequence = await getNextSequence("inspection");
    const inspectionNumber = `I #${sequence.toString().padStart(4, "0")}`;

    const inspectionRequest = await InspectionRequest.create({
      inspectionNumber,
      inspectionType,
      building,
      notes,
      assignedTo,
      keyIssued: keyIssued || false,
      dueDate,
      inspectionColour,
      createdBy: req.user._id,
    });

    return sendSuccess(
      res,
      "Inspection request created successfully",
      { inspectionRequest },
      201
    );
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to create inspection request",
      500
    );
  }
};

// Get all inspection requests
exports.getInspectionRequests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { status, type, user, building, portfolio, dueDate, search } =
      req.query;

    let filter = {};

    // Status filter
    if (status && status !== "All") {
      filter.status = status;
    }

    // Type filter
    if (type && type !== "All") {
      filter.inspectionType = type;
    }

    if (user && user !== "All") {
      const matchedUsers = await User.find({
        preferredName: new RegExp(user, "i"),
      }).distinct("_id");
      filter.assignedTo = { $in: matchedUsers };
    }

    // Building filter
    if (building && building !== "All") {
      filter["building.formData.address"] = new RegExp(building, "i");
    }

    // Portfolio filter
    if (portfolio && portfolio !== "All") {
      filter["building.portfolio.formData.name"] = new RegExp(portfolio, "i");
    }

    // Due date filter
    if (dueDate && dueDate !== "All") {
      filter.dueDate = new Date(dueDate);
    }

    // Global search
    if (search && search.trim() !== "") {
      const regex = new RegExp(search, "i");

      const buildingIds = await Building.find({
        $or: [
          { "formData.address": regex },
          { "formData.fullAddress": regex },
          { buildingAbbreviation: regex },
        ],
      }).distinct("_id");

      filter.$or = [
        { inspectionNumber: regex },
        { inspectionType: regex },
        { status: regex },
        { "assignedTo.preferredName": regex },
        { building: { $in: buildingIds } },
      ];
    }

    const inspectionRequests = await InspectionRequest.find(filter)
      .populate({
        path: "building",
        select: "buildingAbbreviation formData.address portfolio",
        populate: {
          path: "portfolio",
          select: "portfolioAbbreviation formData.name",
        },
      })
      .populate("assignedTo", "preferredName email")
      .populate("createdBy", "preferredName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await InspectionRequest.countDocuments(filter);

    return sendSuccess(res, "Inspection requests fetched successfully", {
      inspectionRequests,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch inspection requests",
      500
    );
  }
};

// Update Inspection Request
exports.updateInspectionRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // If scheduleDate is provided, mark status as scheduled
    if (updateData.scheduleDate) {
      updateData.status = "scheduled";
    }

    const inspectionRequest = await InspectionRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!inspectionRequest)
      return sendError(res, "Inspection request not found", 404);

    return sendSuccess(res, "Inspection request updated successfully", {
      inspectionRequest,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to update inspection request",
      500
    );
  }
};

// Close Inspection Request
exports.closeInspectionRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;

    const inspectionRequest = await InspectionRequest.findById(id);
    if (!inspectionRequest) {
      return res
        .status(404)
        .json({ success: false, message: "Inspection request not found" });
    }

    inspectionRequest.status = "completed";
    inspectionRequest.completeDate = new Date();
    if (comments) inspectionRequest.closingComments = comments;

    await inspectionRequest.save();

    return res.json({
      success: true,
      message: "Inspection request closed successfully",
      data: inspectionRequest,
    });
  } catch (error) {
    console.error("Error closing inspection request:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Delete Inspection Request
exports.deleteInspectionRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const inspectionRequest = await InspectionRequest.findByIdAndDelete(id);

    if (!inspectionRequest)
      return sendError(res, "Inspection request not found", 404);

    return sendSuccess(res, "Inspection request deleted successfully", {
      inspectionRequest,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to delete inspection request",
      500
    );
  }
};

// Create Service Agreement
exports.createServiceAgreement = async (req, res) => {
  try {
    const {
      category,
      building,
      description,
      initialDueDate,
      recurringSchedule,
      vendor,
    } = req.body;

    const fileUrl = req.file
      ? `/uploads/Repair/serviceAgreements/${req.file.filename}`
      : null;

    // Generate service agreement number
    const sequence = await getNextSequence("serviceAgreement");
    const serviceAgreementNumber = `SA #${sequence
      .toString()
      .padStart(4, "0")}`;

    const serviceAgreement = await ServiceAgreement.create({
      serviceAgreementNumber,
      category,
      building,
      description,
      initialDueDate,
      recurringSchedule,
      vendor: vendor || null,
      fileUrl,
      createdBy: req.user._id,
    });

    return sendSuccess(
      res,
      "Service agreement created successfully",
      { serviceAgreement },
      201
    );
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to create service agreement",
      500
    );
  }
};

// Get all service agreements
exports.getServiceAgreements = async (req, res) => {
  try {
    const serviceAgreements = await ServiceAgreement.find()
      .populate({
        path: "building",
        select: "buildingAbbreviation formData.address portfolio",
        populate: {
          path: "portfolio",
          select: "portfolioAbbreviation formData.name",
        },
      })
      .populate("vendor", "companyName technicianName")
      .populate("createdBy", "preferredName email")
      .sort({ createdAt: -1 });

    return sendSuccess(res, "Service agreements fetched successfully", {
      serviceAgreements,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch service agreements",
      500
    );
  }
};

// Update Service Agreement
exports.updateServiceAgreement = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    if (req.body.removeExistingFile === "true") {
      updateData.fileUrl = null;
    }

    // Handle file replacement (if uploaded)
    if (req.file) {
      updateData.fileUrl = `/uploads/Repair/serviceAgreements/${req.file.filename}`;
    }

    const serviceAgreement = await ServiceAgreement.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!serviceAgreement)
      return sendError(res, "Service agreement not found", 404);

    return sendSuccess(res, "Service agreement updated successfully", {
      serviceAgreement,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to update service agreement",
      500
    );
  }
};

// Delete Service Agreement
exports.deleteServiceAgreement = async (req, res) => {
  try {
    const { id } = req.params;
    const serviceAgreement = await ServiceAgreement.findByIdAndDelete(id);

    if (!serviceAgreement)
      return sendError(res, "Service agreement not found", 404);

    return sendSuccess(res, "Service agreement deleted successfully", {
      serviceAgreement,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to delete service agreement",
      500
    );
  }
};

// Update work order status
exports.updateWorkOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const workOrder = await WorkOrder.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!workOrder) return sendError(res, "Work order not found", 404);

    return sendSuccess(res, "Work order status updated successfully", {
      workOrder,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to update work order status",
      500
    );
  }
};
