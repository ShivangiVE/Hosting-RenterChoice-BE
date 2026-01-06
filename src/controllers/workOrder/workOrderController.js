const { completeWorkOrder } = require("../../domain/workOrderState");
const Building = require("../../models/Building");
const InspectionRequest = require("../../models/InspectionRequest");
const Document = require("../../models/Notes&Documents/Document");
const Note = require("../../models/Notes&Documents/Note");
const NoteCategory = require("../../models/Notes&Documents/NoteCategory");
const ServiceAgreement = require("../../models/ServiceAgreement");
const User = require("../../models/User");
const WODynamicStatus = require("../../models/WODynamicStatus");
const WorkOrder = require("../../models/WorkOrder");
const Counter = require("../../utils/Counter");
const { findDynamicStatus } = require("../../utils/dynamicStatus");
const { TYPE_MAP, normalize } = require("../../utils/inspectionType");
const { sendSuccess, sendError } = require("../../utils/response");
const { uploadFile, deleteFile } = require("../../utils/storageService");
const { getIO } = require("../../../socket");
const { createNotification } = require("../../services/notificationService");

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

// Helper to add months to a date
const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
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

    const defaultStatus = await WODynamicStatus.findOne({ isDefault: true });
    if (!defaultStatus) {
      return sendError(
        res,
        "No default dynamic status set. Please configure one.",
        400
      );
    }

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
      dynamicStatus: defaultStatus._id,
      createdBy: req.user._id,
    });

    sendSuccess(res, "Work order created successfully", { workOrder }, 201);

    // Emit socket event AFTER creation
    if (vendor) {
      await createNotification({
        user: vendor,
        role: "Vendor",
        type: "WORK_ORDER_ASSIGNED",
        title: "New Work Order Assigned",
        message: `You have a new work order request (${workOrder.workOrderNumber}). Please Accept or Decline.`,
        entityType: "WorkOrder",
        entityId: workOrder._id,
      });
      getIO().to(`vendor:${vendor.toString()}`).emit("vendor:new-work-order", {
        workOrderId: workOrder._id,
        workOrderNumber: workOrder.workOrderNumber,
      });
    }
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

    const {
      status,
      dynamicStatus,
      category,
      vendor,
      building,
      city,
      portfolio,
      tenancy,
      search,
    } = req.query;

    let filter = {};

    // Role-based filtering example (optional)
    // if (req.user && req.user.role === "SomeRole") {
    //   filter.createdBy = req.user._id;
    // }

    // Status filter
    if (status && status !== "All") filter.status = status;

    // Dynamic status filter by ID or name
    if (dynamicStatus && dynamicStatus !== "All") {
      const statusObj = await WODynamicStatus.findOne({
        $or: [{ _id: dynamicStatus }, { name: new RegExp(dynamicStatus, "i") }],
      });
      if (statusObj) filter.dynamicStatus = statusObj._id;
    }

    // Category filter
    if (category && category !== "All") filter.category = category;

    // Vendor filter
    if (vendor && vendor !== "All") filter.vendor = vendor;

    // Building filter
    if (building && building !== "All") filter.building = building;

    // Due Date filter
    if (req.query.dueDate && req.query.dueDate !== "All") {
      const start = new Date(req.query.dueDate);
      const end = new Date(req.query.dueDate);
      end.setHours(23, 59, 59, 999);

      filter.dueDate = { $gte: start, $lte: end };
    }

    // Portfolio filter (filter by building references)
    if (portfolio && portfolio !== "All") {
      const buildingIdsByPortfolio = await Building.find({
        portfolio: portfolio,
      }).distinct("_id");

      filter.building = filter.building
        ? {
            $in: buildingIdsByPortfolio.filter(
              (id) => id.toString() === filter.building.toString()
            ),
          }
        : { $in: buildingIdsByPortfolio };
    }

    // City filter
    if (city && city !== "All") {
      const buildingIdsByCity = await Building.find({
        "formData.city": new RegExp(city, "i"),
      }).distinct("_id");

      if (filter.building && filter.building.$in) {
        // intersect with existing building filter
        filter.building.$in = filter.building.$in.filter((id) =>
          buildingIdsByCity.includes(id)
        );
      } else if (filter.building) {
        filter.building = buildingIdsByCity.includes(filter.building)
          ? filter.building
          : null;
      } else {
        filter.building = { $in: buildingIdsByCity };
      }
    }

    // Tenancy filter
    if (tenancy && tenancy !== "All") filter.tenant = tenancy;

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

      const searchConditions = [
        { workOrderNumber: regex },
        { description: regex },
        { building: { $in: buildingIds } },
      ];

      // Merge with existing $or if needed
      filter.$or = filter.$or
        ? filter.$or.concat(searchConditions)
        : searchConditions;
    }

    // Fetch work orders with pagination
    const workOrders = await WorkOrder.find(filter)
      .populate({
        path: "building",
        select:
          "buildingAbbreviation formData.city formData.address formData.fullAddress portfolio",
        populate: {
          path: "portfolio",
          select: "portfolioAbbreviation formData.name",
        },
      })
      .populate("vendor", "companyName technicianName")
      .populate("category", "name")
      .populate("createdBy", "preferredName email")
      .populate("dynamicStatus", "name description isDefault")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await WorkOrder.countDocuments(filter);

    return sendSuccess(res, "Work orders fetched successfully", {
      workOrders,
      pagination: { current: page, pages: Math.ceil(total / limit), total },
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch work orders", 500);
  }
};

// Get Vendor Assigned Work Orders
exports.getVendorWorkOrders = async (req, res) => {
  try {
    const vendorId = req.user._id;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const {
      tab,
      category,
      search,
      dynamicStatus,
      dueDate,
      sortBy,
      sortOrder = "asc",
    } = req.query;

    let filter = { vendor: vendorId };
    if (req.query.vendorResponse === "pending") {
      filter.vendorResponse = "pending";
      filter.status = "open";
    }

    //  TAB LOGIC
    if (!req.query.vendorResponse) {
      if (tab === "Pending") {
        const excluded = await WODynamicStatus.find({
          name: { $in: ["Completed", "Declined"] },
        }).distinct("_id");

        filter.status = "open";
        filter.vendorResponse = "accepted";

        if (excluded.length > 0) {
          filter.dynamicStatus = { $nin: excluded };
        }
      } else if (tab === "Completed") {
        const completedStatus = await WODynamicStatus.findOne({
          name: "Completed",
        });

        filter.$or = [
          { status: "closed" },
          completedStatus ? { dynamicStatus: completedStatus._id } : null,
        ].filter(Boolean);
      } else if (tab === "Declined") {
        const declinedStatus = await WODynamicStatus.findOne({
          name: "Declined",
        });

        if (!declinedStatus) {
          return sendSuccess(res, "Vendor work orders fetched", {
            workOrders: [],
            pagination: { current: 1, pages: 0, total: 0 },
          });
        }

        filter.dynamicStatus = declinedStatus._id;
      }
    }
    // ADDITIONAL FILTERS (Refinement only — never override tab)
    // Category filter
    if (category && category !== "All") {
      filter.category = category;
    }

    // Dynamic Status filter
    if (dynamicStatus && dynamicStatus !== "All") {
      // SPECIAL CASE: Closed (Primary Status)
      if (dynamicStatus === "primary-closed") {
        if (tab === "Completed") {
          filter.status = "closed"; // Primary status match
          delete filter.dynamicStatus; // Ensure no conflict
        } else {
          return sendSuccess(res, "Vendor work orders fetched", {
            workOrders: [],
            pagination: { current: 1, pages: 0, total: 0 },
          });
        }
      } else {
        // Existing logic for dynamic statuses
        const dyn = await findDynamicStatus(dynamicStatus);

        if (!dyn) {
          return sendSuccess(res, "Vendor work orders fetched", {
            workOrders: [],
            pagination: { current: 1, pages: 0, total: 0 },
          });
        }

        if (tab === "Pending") {
          const forbidden = ["Completed", "Declined"];
          if (forbidden.includes(dyn.name)) {
            return sendSuccess(res, "Vendor work orders fetched", {
              workOrders: [],
              pagination: { current: 1, pages: 0, total: 0 },
            });
          }

          filter.dynamicStatus = dyn._id;
        } else if (tab === "Completed") {
          if (dyn.name !== "Completed") {
            return sendSuccess(res, "Vendor work orders fetched", {
              workOrders: [],
              pagination: { current: 1, pages: 0, total: 0 },
            });
          }
        } else if (tab === "Declined") {
          if (dyn.name !== "Declined") {
            return sendSuccess(res, "Vendor work orders fetched", {
              workOrders: [],
              pagination: { current: 1, pages: 0, total: 0 },
            });
          }
        } else {
          filter.dynamicStatus = dyn._id;
        }
      }
    }

    //  DUE DATE FILTER
    if (dueDate && dueDate !== "All") {
      const start = new Date(dueDate);
      const end = new Date(dueDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      filter.dueDate = { $gte: start, $lte: end };
    }

    //  Completed DATE FILTER
    if (req.query.completedDate && req.query.completedDate !== "All") {
      const start = new Date(req.query.completedDate);
      const end = new Date(req.query.completedDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      filter.completeDate = { $gte: start, $lte: end };
    }

    // DECLINED DATE FILTER
    // if (req.query.declinedDate && req.query.declinedDate !== "All") {
    //   const start = new Date(req.query.declinedDate);
    //   const end = new Date(req.query.declinedDate);
    //   start.setHours(0, 0, 0, 0);
    //   end.setHours(23, 59, 59, 999);

    //   filter.declinedDate = { $gte: start, $lte: end };
    // }

    // DECLINED DATE RANGE FILTER
    const declinedStartDate = req.query.declinedStartDate;
    const declinedEndDate = req.query.declinedEndDate;

    if (declinedStartDate || declinedEndDate) {
      filter.declinedDate = {};

      // Start date → beginning of the selected day
      if (declinedStartDate) {
        const start = new Date(declinedStartDate);
        start.setHours(0, 0, 0, 0);
        filter.declinedDate.$gte = start;
      }

      // End date → end of the selected day
      if (declinedEndDate) {
        const end = new Date(declinedEndDate);
        end.setHours(23, 59, 59, 999);
        filter.declinedDate.$lte = end;
      }
    }

    //  SEARCH FILTER
    if (search && search.trim() !== "") {
      const regex = new RegExp(search, "i");

      const buildingIds = await Building.find({
        $or: [
          { "formData.address": regex },
          { "formData.fullAddress": regex },
          { buildingAbbreviation: regex },
        ],
      }).distinct("_id");

      if (buildingIds.length === 0) {
        return sendSuccess(res, "Vendor work orders fetched", {
          workOrders: [],
          pagination: { current: 1, pages: 0, total: 0 },
        });
      }

      filter.building = { $in: buildingIds };
    }

    // SORTING LOGIC
    let sortQuery = {};

    if (sortBy) {
      const map = {
        workStatus: "dynamicStatus",
        dueDate: "dueDate",
        completedDate: "completeDate",
        declinedDate: "updatedAt",
      };

      sortQuery[map[sortBy] || sortBy] = sortOrder === "asc" ? 1 : -1;
    } else {
      sortQuery = { createdAt: -1 };
    }

    // QUERY EXECUTION
    const workOrders = await WorkOrder.find(filter)
      .populate(
        "building",
        "formData.address formData.fullAddress formData.city formData.keyNumber formData.lockCode buildingAbbreviation status"
      )
      .populate("category", "name")
      .populate("dynamicStatus", "name")
      .sort(sortQuery)
      .skip(skip)
      .limit(limit);

    const total = await WorkOrder.countDocuments(filter);

    if (req.query.vendorResponse === "pending") {
      await WorkOrder.updateMany(
        {
          vendor: vendorId,
          vendorResponse: "pending",
          vendorSeenAt: null,
        },
        {
          $set: { vendorSeenAt: new Date() },
        }
      );
    }

    const formatted = workOrders.map((wo) => {
      const dyn = wo.dynamicStatus?.name || "";

      const canEdit =
        wo.status === "open" && !["Completed", "Declined"].includes(dyn);

      return {
        ...wo.toObject(),
        canEditStatus: canEdit,
      };
    });

    return sendSuccess(res, "Vendor work orders fetched", {
      workOrders: formatted,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (err) {
    console.error("Error in getVendorWorkOrders:", err);
    return sendError(res, err.message || "Failed to fetch vendor work orders");
  }
};

// Get Work Orders by Building
exports.getWorkOrdersByBuilding = async (req, res) => {
  try {
    const { buildingId, page = 1, limit = 10, status } = req.query;

    if (!buildingId) {
      return sendError(res, "Building ID is required", 400);
    }

    const skip = (page - 1) * limit;

    const filter = { building: buildingId };
    if (status && status !== "All") {
      filter.status = status;
    }

    // Fetch work orders
    const [workOrders, total] = await Promise.all([
      WorkOrder.find(filter)
        .populate({
          path: "building",
          select:
            "buildingAbbreviation formData.city formData.address formData.fullAddress portfolio",
          populate: {
            path: "portfolio",
            select: "portfolioAbbreviation formData.name",
          },
        })
        .populate("vendor", "companyName technicianName")
        .populate("category", "name")
        .populate("createdBy", "preferredName email")
        .populate("dynamicStatus", "name description isDefault")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      WorkOrder.countDocuments(filter),
    ]);

    return sendSuccess(res, "Work orders fetched successfully", {
      workOrders,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch work orders by building",
      500
    );
  }
};

// Get single work order
exports.getWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const workOrder = await WorkOrder.findById(id)
      .populate({
        path: "building",
        select:
          "buildingAbbreviation formData.address formData.keyNumber formData.lockCode portfolio status",
        populate: {
          path: "portfolio",
          select: "portfolioAbbreviation formData.name",
        },
      })
      .populate("vendor", "companyName technicianName email")
      .populate("category", "name")
      .populate("createdBy", "preferredName email")
      .populate("dynamicStatus", "name description isDefault")
      .populate("assignedTo", "preferredName email");

    if (!workOrder) return sendError(res, "Work order not found", 404);

    const dyn = workOrder.dynamicStatus?.name ?? "";
    const canEdit =
      workOrder.status === "open" && !["Completed", "Declined"].includes(dyn);

    return sendSuccess(res, "Work order fetched successfully", {
      workOrder: {
        ...workOrder.toObject(),
        canEditStatus: canEdit,
      },
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch work order", 500);
  }
};

// Update Work Order
exports.updateWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    const workOrder = await WorkOrder.findById(id);
    if (!workOrder) return sendError(res, "Work order not found", 404);

    if (req.body.removeExistingFile === "true" && workOrder.fileUrl) {
      await deleteFile(workOrder.fileUrl);
      updateData.fileUrl = null;
    }

    if (req.file) {
      if (workOrder.fileUrl) await deleteFile(workOrder.fileUrl);
      updateData.fileUrl = await uploadFile(
        req.file,
        "uploads/Repair/workOrders"
      );
    }

    if (updateData.dynamicStatus) {
      const statusExists = await WODynamicStatus.findById(
        updateData.dynamicStatus
      );
      if (!statusExists) return sendError(res, "Invalid dynamic status", 400);
    }

    const updated = await WorkOrder.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).populate("dynamicStatus", "name description");

    return sendSuccess(res, "Work order updated successfully", {
      workOrder: updated,
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to update work order", 500);
  }
};

// Vendor Accept Work Order
exports.vendorAcceptWorkOrder = async (req, res) => {
  const { id } = req.params;

  const wo = await WorkOrder.findById(id);
  if (!wo) return sendError(res, "Work order not found", 404);

  //  MUST be assigned
  if (!wo.vendor) {
    return sendError(res, "This work order is not assigned to any vendor", 403);
  }

  //  MUST belong to logged-in vendor
  if (wo.vendor.toString() !== req.user._id.toString()) {
    return sendError(res, "You are not allowed to accept this work order", 403);
  }

  // MUST be pending
  if (wo.vendorResponse !== "pending") {
    return sendError(res, "Work order already responded", 400);
  }

  wo.vendorResponse = "accepted";
  await wo.save();

  return sendSuccess(res, "Work order accepted", { workOrder: wo });
};

// Vendor Decline Work Order
exports.vendorDeclineWorkOrder = async (req, res) => {
  const { id } = req.params;

  const declinedStatus = await WODynamicStatus.findOne({ name: "Declined" });
  if (!declinedStatus) return sendError(res, "Declined status missing", 400);

  const wo = await WorkOrder.findById(id);
  if (!wo) return sendError(res, "Work order not found", 404);

  //  MUST be assigned
  if (!wo.vendor) {
    return sendError(res, "This work order is not assigned to any vendor", 403);
  }

  //  MUST belong to logged-in vendor
  if (wo.vendor.toString() !== req.user._id.toString()) {
    return sendError(
      res,
      "You are not allowed to decline this work order",
      403
    );
  }

  //  MUST be pending
  if (wo.vendorResponse !== "pending") {
    return sendError(res, "Work order already responded", 400);
  }

  wo.vendorResponse = "declined";
  wo.dynamicStatus = declinedStatus._id;
  wo.declinedDate = new Date();
  wo.status = "open";

  await wo.save();

  return sendSuccess(res, "Work order declined", { workOrder: wo });
};

// Vendor Update Work Order
exports.vendorUpdateWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Only dynamicStatus is allowed
    const allowed = ["dynamicStatus"];
    const invalid = Object.keys(updates).filter(
      (key) => !allowed.includes(key)
    );
    if (invalid.length > 0) {
      return sendError(res, `You cannot update: ${invalid.join(", ")}`, 400);
    }

    // Validate dynamicStatus sent
    let newStatus = null;
    if (updates.dynamicStatus) {
      newStatus = await WODynamicStatus.findById(updates.dynamicStatus);
      if (!newStatus) {
        return sendError(res, "Invalid dynamic status", 400);
      }

      // Vendors CANNOT update to Completed & Declined
      if (["Completed", "Declined"].includes(newStatus.name)) {
        return sendError(
          res,
          `Vendors are not allowed to change status to ${newStatus.name}`,
          403
        );
      }
    }

    const workOrder = await WorkOrder.findById(id);
    if (!workOrder) return sendError(res, "Work order not found", 404);

    // Ensure vendor owns the work order
    if (workOrder.vendor.toString() !== req.user._id.toString()) {
      return sendError(res, "Unauthorized vendor", 403);
    }

    const currentDyn = workOrder.dynamicStatus?.toString();
    let currentStatusName = "";

    if (currentDyn) {
      const ds = await WODynamicStatus.findById(currentDyn);
      currentStatusName = ds?.name;
    }

    if (["Completed", "Declined"].includes(currentStatusName)) {
      return sendError(
        res,
        `You cannot change dynamic status because it is already marked as ${currentStatusName}`,
        400
      );
    }

    // BLOCK if primary status is closed
    if (workOrder.status === "closed") {
      return sendError(
        res,
        "You cannot update status because the work order is already closed",
        400
      );
    }

    if (newStatus && newStatus.name === "Declined") {
      workOrder.dynamicStatus = newStatus._id;
      workOrder.declinedDate = new Date();
      workOrder.status = "open";
    } else {
      // Normal update
      Object.assign(workOrder, updates);
    }

    await workOrder.save();

    const updated = await WorkOrder.findById(id).populate(
      "dynamicStatus",
      "name description"
    );

    return sendSuccess(res, "Work order updated", { workOrder: updated });
  } catch (err) {
    return sendError(res, err.message || "Failed to update work order", 500);
  }
};

// Vendor Bulk Update Work Order Status
exports.vendorBulkUpdateWorkOrderStatus = async (req, res) => {
  try {
    const vendorId = req.user._id;
    const { ids, dynamicStatus } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return sendError(res, "No work order IDs provided", 400);
    }

    if (!dynamicStatus) {
      return sendError(res, "dynamicStatus is required", 400);
    }

    // Validate Status
    const statusExists = await WODynamicStatus.findById(dynamicStatus);
    if (!statusExists) {
      return sendError(res, "Invalid dynamic status", 400);
    }

    // Restriction: Vendor cannot set Completed
    if (["Completed", "Declined"].includes(statusExists.name)) {
      return sendError(
        res,
        `You are not allowed to update status to ${statusExists.name}`,
        403
      );
    }

    // Ensure vendor owns all work orders
    const workOrders = await WorkOrder.find({
      _id: { $in: ids },
      vendor: vendorId,
    });

    if (workOrders.length !== ids.length) {
      return sendError(
        res,
        "One or more work orders do not belong to this vendor",
        403
      );
    }

    for (const wo of workOrders) {
      const dyn = await WODynamicStatus.findById(wo.dynamicStatus);
      const dynName = dyn?.name;

      if (["Completed", "Declined"].includes(dynName)) {
        return sendError(
          res,
          `Cannot update Work Order ${wo.workOrderNumber} because its status is already ${dynName}`,
          400
        );
      }

      if (wo.status === "closed") {
        return sendError(
          res,
          `Cannot update Work Order ${wo.workOrderNumber} because it is already closed`,
          400
        );
      }
    }

    // Bulk update
    let updateFields = { dynamicStatus };

    if (statusExists.name === "Declined") {
      updateFields.declinedDate = new Date();
      updateFields.status = "open";
    }
    await WorkOrder.updateMany({ _id: { $in: ids } }, { $set: updateFields });

    return sendSuccess(res, "Statuses updated successfully", {
      updatedCount: ids.length,
    });
  } catch (err) {
    return sendError(res, err.message || "Bulk update failed", 500);
  }
};

// Vendor Request Due Date Extension
exports.vendorRequestDueDateExtension = async (req, res) => {
  try {
    const { id } = req.params;
    const { requestedDate, reason } = req.body;

    if (!requestedDate) {
      return sendError(res, "Requested due date is required", 400);
    }

    if (!reason || !reason.trim()) {
      return sendError(res, "Extension reason is required", 400);
    }

    const workOrder = await WorkOrder.findById(id);
    if (!workOrder) return sendError(res, "Work order not found", 404);

    const currentDueDate = workOrder.dueDate;
    const requested = new Date(requestedDate);

    if (!currentDueDate) {
      return sendError(
        res,
        "Cannot request extension because due date is not set",
        400
      );
    }

    const maxAllowedDate = addMonths(currentDueDate, 3);
    if (requested > maxAllowedDate) {
      return sendError(
        res,
        "Extension request cannot exceed 3 months from the current due date",
        400
      );
    }

    if (!workOrder.vendor) {
      return sendError(
        res,
        "This work order is not assigned to any vendor",
        403
      );
    }

    if (workOrder.vendor.toString() !== req.user._id.toString()) {
      return sendError(
        res,
        "You can request an extension only for work orders assigned to you",
        403
      );
    }

    if (workOrder.status === "closed") {
      return sendError(
        res,
        "Cannot request due date extension for a closed work order",
        400
      );
    }

    const dyn = await WODynamicStatus.findById(workOrder.dynamicStatus);
    if (["Completed", "Declined"].includes(dyn?.name)) {
      return sendError(
        res,
        "Cannot request extension for completed or declined work order",
        400
      );
    }

    // Prevent multiple pending requests
    if (
      workOrder.dueDateExtension?.status === "pending" &&
      workOrder.dueDateExtension?.requestedDate
    ) {
      return sendError(
        res,
        "An extension request is already pending approval",
        400
      );
    }

    // Save previous extension to history if it exists
    if (workOrder.dueDateExtension?.reason) {
      if (!workOrder.dueDateExtensionHistory) {
        workOrder.dueDateExtensionHistory = [];
      }

      workOrder.dueDateExtensionHistory.push({
        requestedBy: workOrder.dueDateExtension.requestedBy,
        requestedDate: workOrder.dueDateExtension.requestedDate,
        requestedAt: workOrder.dueDateExtension.requestedAt,
        reason: workOrder.dueDateExtension.reason,
        status: workOrder.dueDateExtension.status,
        reviewedBy: workOrder.dueDateExtension.reviewedBy,
        reviewedAt: workOrder.dueDateExtension.reviewedAt,
        reviewRemarks: workOrder.dueDateExtension.reviewRemarks,
      });
    }

    // Create new extension request
    workOrder.dueDateExtension = {
      requestedBy: req.user._id,
      requestedDate: new Date(requestedDate),
      requestedAt: new Date(),
      reason,
      status: "pending",
    };

    workOrder.markModified("dueDateExtension");
    workOrder.markModified("dueDateExtensionHistory");
    await workOrder.save();

    // Socket / Notification
    getIO().emit("work-order:due-date-extension-requested", {
      workOrderId: workOrder._id,
      workOrderNumber: workOrder.workOrderNumber,
    });

    return sendSuccess(res, "Due date extension requested", { workOrder });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// Approve / Reject Due Date Extension by internal staff
exports.reviewDueDateExtension = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, remarks } = req.body;

    if (!["Admin", "OfficeAdmin", "RepairsTeam"].includes(req.user.role)) {
      return sendError(
        res,
        "You are not authorized to review due date extensions",
        403
      );
    }

    if (!["approved", "rejected"].includes(action)) {
      return sendError(res, "Invalid action", 400);
    }

    if (action === "rejected" && (!remarks || !remarks.trim())) {
      return sendError(
        res,
        "Remarks are mandatory when rejecting an extension request",
        400
      );
    }

    const workOrder = await WorkOrder.findById(id);
    if (!workOrder || !workOrder.dueDateExtension) {
      return sendError(res, "No extension request found", 404);
    }

    if (workOrder.dueDateExtension.status !== "pending") {
      return sendError(res, "Request already reviewed", 400);
    }

    workOrder.dueDateExtension.status = action;
    workOrder.dueDateExtension.reviewedBy = req.user._id;
    workOrder.dueDateExtension.reviewedAt = new Date();
    workOrder.dueDateExtension.reviewRemarks = remarks || null;

    if (action === "approved") {
      const newDueDate = workOrder.dueDateExtension.requestedDate;

      if (!newDueDate) {
        return sendError(res, "Requested due date missing", 400);
      }

      workOrder.dueDate = new Date(newDueDate);
    }

    // Move reviewed extension to history
    if (!workOrder.dueDateExtensionHistory) {
      workOrder.dueDateExtensionHistory = [];
    }

    workOrder.dueDateExtensionHistory.push({
      requestedBy: workOrder.dueDateExtension.requestedBy,
      requestedDate: workOrder.dueDateExtension.requestedDate,
      requestedAt: workOrder.dueDateExtension.requestedAt,
      reason: workOrder.dueDateExtension.reason,
      status: workOrder.dueDateExtension.status,
      reviewedBy: workOrder.dueDateExtension.reviewedBy,
      reviewedAt: workOrder.dueDateExtension.reviewedAt,
      reviewRemarks: workOrder.dueDateExtension.reviewRemarks,
    });

    // Clear current extension (it's now in history)
    workOrder.dueDateExtension = undefined;

    workOrder.markModified("dueDate");
    workOrder.markModified("dueDateExtension");
    workOrder.markModified("dueDateExtensionHistory");
    await workOrder.save();

    // Notify vendor
    getIO()
      .to(`vendor:${workOrder.vendor}`)
      .emit("work-order:due-date-extension-reviewed", {
        workOrderId: workOrder._id,
        status: action,
        newDueDate: workOrder.dueDate,
        remarks: remarks,
      });

    return sendSuccess(res, `Request ${action}`, { workOrder });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// Vendor Mark Work Orders as Completed
exports.markWorkOrderCompleted = async (req, res) => {
  try {
    const { id } = req.params;
    const { note, keyReturnOption, invoiceOption, invoiceDescription } =
      req.body;

    const workOrder = await WorkOrder.findById(id);
    if (!workOrder) return sendError(res, "Work order not found", 404);

    // Vendor security check
    if (req.user.role === "Vendor") {
      if (
        !workOrder.vendor ||
        workOrder.vendor.toString() !== req.user._id.toString()
      ) {
        return sendError(res, "Not authorized", 403);
      }
    }

    //  INVOICE VALIDATION
    if (invoiceOption === "upload_now") {
      if (!req.files || req.files.length === 0) {
        return sendError(
          res,
          "Invoice upload is mandatory when 'Upload Now' is selected",
          400
        );
      }
    }

    // HANDLE KEY RETURN LOGIC
    // let finalKeyOption = workOrder.keyIssued ? keyReturnOption : null;
    if (workOrder.keyIssued === true && !keyReturnOption) {
      return sendError(
        res,
        "Key return selection is mandatory because a key was issued",
        400
      );
    }

    // if (workOrder.keyIssued) {
    //   if (finalKeyOption === "returned_now") {
    //     workOrder.keyIssued = false;
    //     workOrder.keyReturnStatus = "Returned";
    //   } else if (finalKeyOption === "return_later") {
    //     workOrder.keyReturnStatus = "Return Later";
    //   }
    // }

    //  HANDLE INVOICE UPLOAD NOW
    let invoiceUrl = null;

    if (invoiceOption === "upload_now" && req.files?.length > 0) {
      let invoiceCategory = await NoteCategory.findOne({ name: "Invoice" });
      if (!invoiceCategory) {
        invoiceCategory = await NoteCategory.create({
          name: "Invoice",
          createdBy: req.user._id,
        });
      }

      const invoiceMeta = JSON.parse(req.body.invoiceDocuments || "[]");

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const metadata = invoiceMeta[i] || {};

        const fileType = getFileType(file.mimetype);
        const invoiceUrl = await uploadFile(file, "uploads/documents");

        await Document.create({
          fileName: metadata.fileName || file.originalname,
          originalFileName: file.originalname,
          description: metadata.description || "",
          category: invoiceCategory._id,
          fileType,
          mimeType: file.mimetype,
          fileSize: file.size,
          fileUrl: invoiceUrl,
          workOrder: id,
          uploadedBy: req.user._id,
        });
      }

      workOrder.invoiceUploaded = true;
      workOrder.invoicePending = false;
    }

    // HANDLE INVOICE LATER
    if (invoiceOption === "upload_later") {
      workOrder.invoiceUploaded = false;
      workOrder.invoicePending = true;

      await createNotification({
        user: workOrder.vendor,
        role: "Vendor",
        type: "INVOICE_UPLOAD_PENDING",
        title: "Invoice Upload Pending",
        message: `Please upload invoice for ${workOrder.workOrderNumber}`,
        entityType: "WorkOrder",
        entityId: workOrder._id,
      });
    }

    if (invoiceOption === "upload_now") {
      workOrder.invoicePending = false;
      workOrder.invoiceUploaded = true;
    }

    //  COMPLETION NOTE → USE VENDOR CATEGORY
    if (note) {
      let vendorCategory = await NoteCategory.findOne({ name: "Vendor" });
      if (!vendorCategory) {
        vendorCategory = await NoteCategory.create({
          name: "Vendor",
          createdBy: req.user._id,
        });
      }

      await Note.create({
        workOrder: id,
        category: vendorCategory._id,
        subject: "Completion Note",
        description: note,
        createdBy: req.user._id,
      });
    }

    // UPDATE WORK ORDER STATUS
    const completedStatus = await WODynamicStatus.findOne({
      name: "Completed",
    });
    if (!completedStatus)
      return sendError(res, "Completed status missing", 400);

    // workOrder.dynamicStatus = completedStatus._id;
    // workOrder.completeDate = new Date();

    // // Primary status logic
    // workOrder.status = invoiceOption === "upload_now" ? "closed" : "open";

    await completeWorkOrder(workOrder, {
      invoiceUploaded: invoiceOption === "upload_now",
      keyReturnOption,
      validateKey: true,
    });

    await workOrder.save();

    return sendSuccess(res, "Work order marked as completed", { workOrder });
  } catch (err) {
    return sendError(res, err.message || "Failed to complete work order", 500);
  }
};

// Vendor Upload Invoice Later
exports.vendorUploadInvoiceLater = async (req, res) => {
  try {
    const { id } = req.params;

    const workOrder = await WorkOrder.findById(id).populate(
      "dynamicStatus",
      "name"
    );

    if (!workOrder) return sendError(res, "Work order not found", 404);

    //  Vendor security
    if (
      req.user.role === "Vendor" &&
      (!workOrder.vendor ||
        workOrder.vendor.toString() !== req.user._id.toString())
    ) {
      return sendError(res, "Not authorized", 403);
    }

    if (workOrder.dynamicStatus?.name !== "Completed") {
      return sendError(
        res,
        "Invoice can only be uploaded after work order is completed",
        400
      );
    }

    if (!req.files || req.files.length === 0) {
      return sendError(res, "At least one invoice file is required", 400);
    }

    // Ensure Invoice category
    let invoiceCategory = await NoteCategory.findOne({ name: "Invoice" });
    if (!invoiceCategory) {
      invoiceCategory = await NoteCategory.create({
        name: "Invoice",
        createdBy: req.user._id,
      });
    }

    const invoiceMeta = JSON.parse(req.body.invoiceDocuments || "[]");

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const metadata = invoiceMeta[i] || {};

      const fileType = getFileType(file.mimetype);
      const invoiceUrl = await uploadFile(file, "uploads/documents");

      await Document.create({
        fileName: metadata.fileName || file.originalname,
        originalFileName: file.originalname,
        description: metadata.description || "",
        category: invoiceCategory._id,
        fileType,
        mimeType: file.mimetype,
        fileSize: file.size,
        fileUrl: invoiceUrl,
        workOrder: id,
        uploadedBy: req.user._id,
      });
    }

    //  CENTRALIZED STATE TRANSITION
    await completeWorkOrder(workOrder, {
      invoiceUploaded: true,
      validateKey: false,
    });
    await workOrder.save();

    return sendSuccess(res, "Invoice uploaded successfully", { workOrder });
  } catch (err) {
    return sendError(res, err.message || "Failed to upload invoice", 500);
  }
};

exports.vendorConfirmKeyReturn = async (req, res) => {
  const { id } = req.params;

  const workOrder = await WorkOrder.findById(id).populate(
    "dynamicStatus",
    "name"
  );
  if (!workOrder) return sendError(res, "Work order not found", 404);

  if (
    !workOrder.vendor ||
    workOrder.vendor.toString() !== req.user._id.toString()
  ) {
    return sendError(res, "Unauthorized", 403);
  }

  if (workOrder.dynamicStatus?.name !== "Completed") {
    return sendError(res, "Work order not completed", 400);
  }

  if (workOrder.keyReturn?.status !== "pending") {
    return sendError(res, "No pending key return", 400);
  }

  // workOrder.keyIssued = false;
  workOrder.keyReturn.status = "returned";
  workOrder.keyReturn.returnedAt = new Date();
  workOrder.keyReturn.returnedBy = req.user._id;

  await workOrder.save();

  return sendSuccess(res, "Key return confirmed", { workOrder });
};

exports.vendorBulkConfirmKeyReturn = async (req, res) => {
  try {
    const vendorId = req.user._id;
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return sendError(res, "Work order IDs are required", 400);
    }

    const workOrders = await WorkOrder.find({
      _id: { $in: ids },
      vendor: vendorId,
    }).populate("dynamicStatus", "name");

    if (workOrders.length !== ids.length) {
      return sendError(
        res,
        "One or more work orders are invalid or unauthorized",
        403
      );
    }

    const errors = [];
    const eligibleIds = [];

    for (const wo of workOrders) {
      if (wo.dynamicStatus?.name !== "Completed") {
        errors.push({
          workOrderId: wo._id,
          reason: "Work order not completed",
        });
        continue;
      }

      if (wo.keyReturn?.status !== "pending") {
        errors.push({
          workOrderId: wo._id,
          reason: "No pending key return",
        });
        continue;
      }

      eligibleIds.push(wo._id);
    }

    if (eligibleIds.length === 0) {
      return sendError(res, "No eligible work orders for key return", 400);
    }

    await WorkOrder.updateMany(
      { _id: { $in: eligibleIds } },
      {
        $set: {
          // keyIssued: false,
          "keyReturn.status": "returned",
          "keyReturn.returnedAt": new Date(),
          "keyReturn.returnedBy": vendorId,
        },
      }
    );

    // getIO().to(`vendor:${vendorId}`).emit("work-order:key-returned", {
    //   workOrderIds: eligibleIds,
    // });

    return sendSuccess(res, "Key return confirmed", {
      totalRequested: ids.length,
      successCount: eligibleIds.length,
      failedCount: errors.length,
      failures: errors,
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to confirm key return", 500);
  }
};

// Get Work Order Timeline (Notes + Extension Activities)
exports.getWorkOrderTimeline = async (req, res) => {
  try {
    const { workOrderId } = req.params;

    // Fetch work order with extension data
    const workOrder = await WorkOrder.findById(workOrderId)
      .populate("dueDateExtension.requestedBy", "preferredName email")
      .populate("dueDateExtension.reviewedBy", "preferredName email")
      .populate("dueDateExtensionHistory.requestedBy", "preferredName email")
      .populate("dueDateExtensionHistory.reviewedBy", "preferredName email")
      .select("dueDateExtension dueDateExtensionHistory createdAt");

    if (!workOrder) {
      return sendError(res, "Work order not found", 404);
    }

    // Fetch ALL notes at once (no limit)
    const notes = await Note.find({ workOrder: workOrderId })
      .populate("category", "name")
      .populate("createdBy", "preferredName technicianName companyName email")
      .sort({ createdAt: -1 })
      .select("subject description category createdBy createdAt");

    // Build timeline items
    let timelineItems = [];

    // Add notes
    notes.forEach((note) => {
      timelineItems.push({
        _id: note._id,
        type: "note",
        description: note.description,
        subject: note.subject,
        category: note.category,
        createdBy: note.createdBy,
        createdAt: note.createdAt,
      });
    });

    // Add current extension request
    if (workOrder.dueDateExtension?.reason) {
      timelineItems.push({
        _id: `extension_request_current`,
        type: "extension_request",
        description: workOrder.dueDateExtension.reason,
        requestedDate: workOrder.dueDateExtension.requestedDate,
        status: workOrder.dueDateExtension.status,
        createdBy: workOrder.dueDateExtension.requestedBy,
        createdAt:
          workOrder.dueDateExtension.requestedAt || workOrder.createdAt,
      });
    }

    // Add historical extensions
    if (workOrder.dueDateExtensionHistory?.length > 0) {
      workOrder.dueDateExtensionHistory.forEach((ext, index) => {
        timelineItems.push({
          _id: `extension_request_history_${index}`,
          type: "extension_request",
          description: ext.reason,
          requestedDate: ext.requestedDate,
          status: ext.status,
          createdBy: ext.requestedBy,
          createdAt: ext.requestedAt || workOrder.createdAt,
        });

        if (ext.reviewRemarks && ext.status !== "pending") {
          timelineItems.push({
            _id: `extension_review_history_${index}`,
            type: "extension_review",
            description: ext.reviewRemarks,
            status: ext.status,
            reviewedAt: ext.reviewedAt,
            createdBy: ext.reviewedBy,
            createdAt: ext.reviewedAt,
          });
        }
      });
    }

    // Sort by date (most recent first)
    timelineItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return sendSuccess(res, "Timeline fetched successfully", {
      timeline: timelineItems,
      total: timelineItems.length,
    });
  } catch (err) {
    console.error("Error fetching timeline:", err);
    return sendError(res, err.message || "Failed to fetch timeline", 500);
  }
};

// Count work orders assigned to vendor
exports.getVendorNewWorkOrderCount = async (req, res) => {
  try {
    const vendorId = req.user._id;

    const count = await WorkOrder.countDocuments({
      vendor: vendorId,
      vendorResponse: "pending",
      status: "open",
      vendorSeenAt: null,
    });

    return sendSuccess(res, "New work order count fetched", { count });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch count", 500);
  }
};

// Delete Work Order
exports.deleteWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const workOrder = await WorkOrder.findById(id);

    if (!workOrder) return sendError(res, "Work order not found", 404);

    if (workOrder.fileUrl) await deleteFile(workOrder.fileUrl);

    await WorkOrder.findByIdAndDelete(id);

    return sendSuccess(res, "Work order deleted successfully");
  } catch (err) {
    return sendError(res, err.message || "Failed to delete work order", 500);
  }
};

// Bulk Delete Work Orders
exports.bulkDeleteWorkOrders = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return sendError(res, "No work order IDs provided", 400);

    const workOrders = await WorkOrder.find({ _id: { $in: ids } });
    for (const wo of workOrders) {
      if (wo.fileUrl) await deleteFile(wo.fileUrl);
    }

    const result = await WorkOrder.deleteMany({ _id: { $in: ids } });
    return sendSuccess(
      res,
      `${result.deletedCount} work orders deleted successfully`
    );
  } catch (err) {
    return sendError(res, err.message || "Failed to delete work orders", 500);
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

    /**
     * 📌 Vendor Security Rule
     * Vendors can ONLY close work orders assigned to them.
     * Internal roles skip this check.
     */
    if (req.user.role === "Vendor") {
      if (!workOrder.vendor) {
        return res.status(403).json({
          success: false,
          message: "This work order is not assigned to any vendor",
        });
      }

      if (workOrder.vendor.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "You are not allowed to close this work order",
        });
      }
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

// Bulk Close Work Orders
exports.bulkCloseWorkOrders = async (req, res) => {
  try {
    const { ids, comments } = req.body; // array of work order IDs + optional comments
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No work order IDs provided",
      });
    }

    const result = await WorkOrder.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          status: "closed",
          completeDate: new Date(),
          ...(comments ? { closingComments: comments } : {}),
        },
      }
    );

    return res.json({
      success: true,
      message: `${result.modifiedCount} work orders closed successfully`,
    });
  } catch (error) {
    console.error("Bulk close work order error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to close work orders",
    });
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

    const {
      status,
      type,
      user,
      building,
      city,
      portfolio,
      dueDate,
      scheduleDate,
      completeDate,
      search,
    } = req.query;

    let filter = {};

    // Filter by logged-in user
    // Only show inspection requests assigned to this user
    if (req.user && req.user.role === "InspectionClerk") {
      filter.assignedTo = req.user._id;
    }

    // Existing filters
    if (status && status !== "All") filter.status = status;
    // if (type && type !== "All") filter.inspectionType = type;

    // Updated Filter for Inspection Type (Marketing + Move-out, SAFE)
    if (type && type !== "All") {
      const normalizedType = normalize(type);

      if (normalizedType === "marketing") {
        filter.inspectionType = { $regex: TYPE_MAP.marketing };
      } else if (
        normalizedType === "moveout" ||
        normalizedType === "moveoutinspection"
      ) {
        filter.inspectionType = {
          $regex: TYPE_MAP.moveoutinspection,
        };
      } else {
        // Default exact match (preserves old functionality)
        filter.inspectionType = type;
      }
    }

    if (user && user !== "All") {
      const matchedUsers = await User.find({
        preferredName: new RegExp(user, "i"),
      }).distinct("_id");
      filter.assignedTo = { $in: matchedUsers };
    }

    if (building && building !== "All")
      filter["building.formData.address"] = new RegExp(building, "i");
    if (portfolio && portfolio !== "All")
      filter["building.portfolio.formData.name"] = new RegExp(portfolio, "i");

    // Due Date filter
    if (dueDate && dueDate !== "All") {
      const start = new Date(dueDate);
      const end = new Date(dueDate);
      end.setHours(23, 59, 59, 999);

      filter.dueDate = { $gte: start, $lte: end };
    }

    // Schedule Date filter
    if (scheduleDate && scheduleDate !== "All") {
      const start = new Date(scheduleDate);
      const end = new Date(scheduleDate);
      end.setHours(23, 59, 59, 999);
      filter.scheduleDate = { $gte: start, $lte: end };
    }

    // Completed Date filter
    if (completeDate && completeDate !== "All") {
      const start = new Date(completeDate);
      const end = new Date(completeDate);
      end.setHours(23, 59, 59, 999);
      filter.completeDate = { $gte: start, $lte: end };
    }

    if (city && city !== "All") {
      const buildingIdsByCity = await Building.find({
        "formData.city": new RegExp(city, "i"),
      }).distinct("_id");

      if (filter["building.formData.address"]) {
        // If filtering by address too, intersect buildingIds
        const buildingIdsByAddress = await Building.find({
          "formData.address": filter["building.formData.address"],
        }).distinct("_id");

        filter.building = {
          $in: buildingIdsByCity.filter((id) =>
            buildingIdsByAddress.includes(id)
          ),
        };
        delete filter["building.formData.address"];
      } else {
        filter.building = { $in: buildingIdsByCity };
      }
    }

    let sortQuery = { createdAt: -1 };

    if (req.query.sortBy) {
      const field = req.query.sortBy;
      const direction = req.query.sortOrder === "desc" ? -1 : 1;

      const sortableFields = [
        "inspectionNumber",
        "inspectionType",
        "dueDate",
        "scheduleDate",
      ];

      if (sortableFields.includes(field)) {
        sortQuery = { [field]: direction };
      }

      // Special handling for nested fields
      if (field === "community") {
        sortQuery = { "building.formData.city": direction };
      }

      if (field === "address") {
        sortQuery = { "building.formData.address": direction };
      }
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
        select:
          "buildingAbbreviation formData.address formData.city formData.address formData.fullAddress portfolio",
        populate: {
          path: "portfolio",
          select: "portfolioAbbreviation formData.name",
        },
      })
      .populate("assignedTo", "preferredName email")
      .populate("createdBy", "preferredName email")
      .sort(sortQuery)
      .skip(skip)
      .limit(limit);

    const total = await InspectionRequest.countDocuments(filter);

    return sendSuccess(res, "Inspection requests fetched successfully", {
      inspectionRequests,
      pagination: { current: page, pages: Math.ceil(total / limit), total },
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch inspection requests",
      500
    );
  }
};

// Get Inspection Requests by Building
exports.getInspectionRequestsByBuilding = async (req, res) => {
  try {
    const {
      buildingId,
      page = 1,
      limit = 10,
      status,
      inspectionType,
      assignedTo,
      startDate,
      endDate,
    } = req.query;

    if (!buildingId) return sendError(res, "Building ID is required", 400);

    const skip = (page - 1) * limit;

    // Build filter object - DON'T hardcode status
    const filter = { building: buildingId };

    // Filter by status (if provided) - maintains backward compatibility
    if (status && status !== "All") {
      filter.status = status;
    }

    // Filter by inspection type
    if (inspectionType && inspectionType !== "" && inspectionType !== "All") {
      filter.inspectionType = inspectionType;
    }

    // Filter by assigned user (completed by)
    if (assignedTo && assignedTo !== "" && assignedTo !== "All") {
      filter.assignedTo = assignedTo;
    }

    // Filter by completion date range
    if (startDate || endDate) {
      filter.completeDate = {};

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.completeDate.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.completeDate.$lte = end;
      }
    }

    const [inspectionRequests, total] = await Promise.all([
      InspectionRequest.find(filter)
        .populate({
          path: "building",
          select:
            "buildingAbbreviation formData.city formData.address formData.fullAddress portfolio",
          populate: {
            path: "portfolio",
            select: "portfolioAbbreviation formData.name",
          },
        })
        .populate("assignedTo", "preferredName email")
        .populate("createdBy", "preferredName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      InspectionRequest.countDocuments(filter),
    ]);

    return sendSuccess(res, "Inspection requests fetched successfully", {
      inspectionRequests,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch inspection requests by building",
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

    inspectionRequest.status = "closed";
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

// Bulk Close Inspection Requests
exports.bulkCloseInspectionRequests = async (req, res) => {
  try {
    const { ids, comments } = req.body; // array of inspection request IDs + optional comments
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No inspection request IDs provided",
      });
    }

    const result = await InspectionRequest.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          status: "closed",
          completeDate: new Date(),
          ...(comments ? { closingComments: comments } : {}),
        },
      }
    );

    return res.json({
      success: true,
      message: `${result.modifiedCount} inspection requests closed successfully`,
    });
  } catch (error) {
    console.error("Bulk close inspection request error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to close inspection requests",
    });
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

// Bulk Delete Inspection Requests
exports.bulkDeleteInspectionRequests = async (req, res) => {
  try {
    const { ids } = req.body; // array of inspection request IDs
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No inspection request IDs provided",
      });
    }

    const result = await InspectionRequest.deleteMany({ _id: { $in: ids } });

    return res.json({
      success: true,
      message: `${result.deletedCount} inspection requests deleted successfully`,
    });
  } catch (err) {
    console.error("Bulk delete inspection error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete inspection requests",
    });
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

    let fileUrl = null;
    if (req.file) {
      fileUrl = await uploadFile(req.file, "uploads/Repair/serviceAgreements");
    }

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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const {
      dueDate,
      category,
      vendor,
      building,
      portfolio,
      vendorStatus,
      search,
    } = req.query;

    let filter = {};

    //  Due Date
    if (dueDate && dueDate !== "All") {
      const start = new Date(dueDate);
      const end = new Date(dueDate);
      end.setHours(23, 59, 59, 999);

      filter.initialDueDate = { $gte: start, $lte: end };
    }

    //  Category
    if (category && category !== "All") {
      filter.category = category; // expecting categoryId
    }

    //  Vendor
    if (vendor && vendor !== "All") {
      filter.vendor = vendor; // expecting vendorId
    }

    //  Vendor Status (via User collection lookup)
    if (vendorStatus && vendorStatus !== "All") {
      const vendorIds = await User.find({ status: vendorStatus }).distinct(
        "_id"
      );
      filter.vendor = { $in: vendorIds };
    }

    // Building
    if (building && building !== "All") {
      filter.building = building; // expecting buildingId
    }

    // Portfolio (via Building lookup)
    if (portfolio && portfolio !== "All") {
      const buildingIds = await Building.find({
        portfolio: portfolio,
      }).distinct("_id");
      filter.building = { $in: buildingIds };
    }

    // Global Search
    if (search && search.trim() !== "") {
      const regex = new RegExp(search, "i");

      // Find buildings that match search
      const buildingIds = await Building.find({
        $or: [
          { "formData.address": regex },
          { "formData.fullAddress": regex },
          { buildingAbbreviation: regex },
        ],
      }).distinct("_id");

      // Find vendors that match search
      const vendorIds = await User.find({
        $or: [{ companyName: regex }, { technicianName: regex }],
      }).distinct("_id");

      filter.$or = [
        { serviceAgreementNumber: regex },
        { description: regex },
        { building: { $in: buildingIds } },
        { vendor: { $in: vendorIds } },
      ];
    }

    // Query with population
    const serviceAgreements = await ServiceAgreement.find(filter)
      .populate({
        path: "building",
        select:
          "buildingAbbreviation formData.city formData.address formData.fullAddress portfolio",
        populate: {
          path: "portfolio",
          select: "portfolioAbbreviation formData.name",
        },
      })
      .populate("vendor", "companyName technicianName status")
      .populate("category", "name")
      .populate("createdBy", "preferredName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await ServiceAgreement.countDocuments(filter);

    return sendSuccess(res, "Service agreements fetched successfully", {
      serviceAgreements,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch service agreements",
      500
    );
  }
};

// Get Service Agreements by Building
exports.getServiceAgreementsByBuilding = async (req, res) => {
  try {
    const { buildingId, page = 1, limit = 10, status } = req.query;

    if (!buildingId) return sendError(res, "Building ID is required", 400);

    const skip = (page - 1) * limit;

    const filter = { building: buildingId };
    if (status && status !== "All") filter.status = status;

    const [serviceAgreements, total] = await Promise.all([
      ServiceAgreement.find(filter)
        .populate({
          path: "building",
          select:
            "buildingAbbreviation formData.city formData.address formData.fullAddress portfolio",
          populate: {
            path: "portfolio",
            select: "portfolioAbbreviation formData.name",
          },
        })
        .populate("vendor", "companyName technicianName email")
        .populate("category", "name")
        .populate("createdBy", "preferredName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      ServiceAgreement.countDocuments(filter),
    ]);

    return sendSuccess(res, "Service agreements fetched successfully", {
      serviceAgreements,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch service agreements by building",
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

    const serviceAgreement = await ServiceAgreement.findById(id);
    if (!serviceAgreement)
      return sendError(res, "Service agreement not found", 404);

    if (req.body.removeExistingFile === "true" && serviceAgreement.fileUrl) {
      await deleteFile(serviceAgreement.fileUrl);
      updateData.fileUrl = null;
    }

    if (req.file) {
      if (serviceAgreement.fileUrl) await deleteFile(serviceAgreement.fileUrl);
      updateData.fileUrl = await uploadFile(
        req.file,
        "uploads/Repair/serviceAgreements"
      );
    }

    const updated = await ServiceAgreement.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    return sendSuccess(res, "Service agreement updated successfully", {
      serviceAgreement: updated,
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

    if (serviceAgreement.fileUrl) await deleteFile(serviceAgreement.fileUrl);

    await ServiceAgreement.findByIdAndDelete(id);

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

// Bulk Delete Service Agreements
exports.bulkDeleteServiceAgreements = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length)
      return sendError(res, "No service agreement IDs provided", 400);

    const agreements = await ServiceAgreement.find({ _id: { $in: ids } });
    for (const sa of agreements) {
      if (sa.fileUrl) await deleteFile(sa.fileUrl);
    }

    const result = await ServiceAgreement.deleteMany({ _id: { $in: ids } });
    return sendSuccess(
      res,
      `${result.deletedCount} service agreements deleted successfully`
    );
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to bulk delete service agreements",
      500
    );
  }
};

// Close Service Agreement
exports.closeServiceAgreement = async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;

    const serviceAgreement = await ServiceAgreement.findById(id);
    if (!serviceAgreement) {
      return res
        .status(404)
        .json({ success: false, message: "Service agreement not found" });
    }

    serviceAgreement.status = "closed";
    serviceAgreement.closedAt = new Date();
    if (comments) {
      serviceAgreement.closingComments = comments;
    }

    await serviceAgreement.save();

    res.json({
      success: true,
      message: "Service agreement closed successfully",
      data: serviceAgreement,
    });
  } catch (error) {
    console.error("Error closing service agreement:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Bulk Close Service Agreements
exports.bulkCloseServiceAgreements = async (req, res) => {
  try {
    const { ids, comments } = req.body; // array of service agreement IDs + optional comments
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No service agreement IDs provided",
      });
    }

    const result = await ServiceAgreement.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          status: "closed",
          closedAt: new Date(),
          ...(comments ? { closingComments: comments } : {}),
        },
      }
    );

    return res.json({
      success: true,
      message: `${result.modifiedCount} service agreements closed successfully`,
    });
  } catch (error) {
    console.error("Bulk close service agreement error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to close service agreements",
    });
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
