const InspectionRequest = require("../../models/InspectionRequest");
const ServiceAgreement = require("../../models/ServiceAgreement");
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
      ? `/uploads/workOrders/${req.file.filename}`
      : null;

    // Generate work order number
    const sequence = await getNextSequence("workOrder");
    const workOrderNumber = `WO #${sequence.toString().padStart(4, "0")}`;

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
      ? `/uploads/workOrders/${req.file.filename}`
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

// Get all work orders
exports.getWorkOrders = async (req, res) => {
  try {
    const workOrders = await WorkOrder.find()
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
      .sort({ createdAt: 1 });

    return sendSuccess(res, "Work orders fetched successfully", { workOrders });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch work orders", 500);
  }
};

// Get all inspection requests
exports.getInspectionRequests = async (req, res) => {
  try {
    const inspectionRequests = await InspectionRequest.find()
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
      .sort({ createdAt: -1 });

    return sendSuccess(res, "Inspection requests fetched successfully", {
      inspectionRequests,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch inspection requests",
      500
    );
  }
};

// Get all service agreements
exports.getServiceAgreements = async (req, res) => {
  try {
    const serviceAgreements = await ServiceAgreement.find()
      .populate("building", "buildingAbbreviation formData.address")
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

// Get single work order
exports.getWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const workOrder = await WorkOrder.findById(id)
      .populate("building", "buildingAbbreviation formData")
      .populate("vendor", "companyName technicianName email")
      .populate("createdBy", "preferredName email")
      .populate("assignedTo", "preferredName email");

    if (!workOrder) return sendError(res, "Work order not found", 404);

    return sendSuccess(res, "Work order fetched successfully", { workOrder });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch work order", 500);
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
