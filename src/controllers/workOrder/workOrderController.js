const mongoose = require("mongoose");
const { completeWorkOrder } = require("../../domain/workOrderState");
const Building = require("../../models/Building");
const InspectionRequest = require("../../models/InspectionRequest");
const Document = require("../../models/Notes&Documents/Document");
const Note = require("../../models/Notes&Documents/Note");
const NoteCategory = require("../../models/Notes&Documents/NoteCategory");
const Category = require("../../models/repairCategories");
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
const { validateFutureOrTodayDate } = require("../../utils/dateValidator");
const { assertVendorAccepted } = require("../../utils/vendorGuards");
const resolveTeamUserIds = require("../../utils/resolveTeamUserIds");
const {
  scheduleReminder,
  resolveReminders,
  cancelAllReminders,
} = require("../../services/notificationReminderService");
const {
  notifyInternalUsers,
} = require("../../services/internalNotificationService");
const { getFileType } = require("../../utils/fileType");
const { finalizeInvoice } = require("../../services/invoiceFinalizeService");
const {
  assignBillNumberIfMissing,
} = require("../../utils/generateAccountNumber");
const resolveCompanyVendorIds = require("../../utils/resolveCompanyVendorIds");
const buildCompanyScopeFilter = require("../../utils/buildCompanyScopeFilter");

// Helper function to get next sequence number
const getNextSequence = async (sequenceName) => {
  const counter = await Counter.findByIdAndUpdate(
    sequenceName,
    { $inc: { sequence_value: 1 } },
    { new: true, upsert: true },
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

// Helper to add months to a date
const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

const DEFAULT_LIMIT = 15;

// Create Work Order
exports.createWorkOrder = async (req, res) => {
  try {
    const {
      workOrderType,
      category,
      building,
      description,
      vendor, // direct-assign path (legacy) — single vendor userId
      company, // NEW — company-assign path
      keyIssued,
      dueDate,
    } = req.body;

    const defaultStatus = await WODynamicStatus.findOne({ isDefault: true });
    if (!defaultStatus) {
      return sendError(
        res,
        "No default dynamic status set. Please configure one.",
        400,
      );
    }
    if (dueDate) validateFutureOrTodayDate(dueDate, "Due date");
    if (!vendor && !company) {
      return sendError(
        res,
        "Either a vendor or a company must be assigned",
        400,
      );
    }

    const fileUrl = req.file
      ? `/uploads/Repair/workOrders/${req.file.filename}`
      : null;
    const sequence = await getNextSequence("workOrder");
    const workOrderNumber = `WO #${sequence.toString().padStart(4, "0")}`;

    const normalizeStatus = (status) => {
      if (!status) return "open";
      const s = status.toLowerCase();
      return s === "closed" ? "closed" : "open";
    };

    let assignmentType = "direct";
    let vendorResponses = [];
    let resolvedVendor = vendor || null;

    if (company && !vendor) {
      assignmentType = "company";
      const vendorIds = await resolveCompanyVendorIds(company);

      if (vendorIds.length === 0) {
        return sendError(
          res,
          "This company has no active vendor users to assign",
          400,
        );
      }

      vendorResponses = vendorIds.map((userId) => ({
        user: userId,
        response: "pending",
      }));
      resolvedVendor = null; // nobody has accepted yet
    }

    const workOrder = await WorkOrder.create({
      workOrderNumber,
      workOrderType,
      category,
      building,
      description,
      assignmentType,
      assignedCompany: assignmentType === "company" ? company : undefined,
      vendor: resolvedVendor,
      vendorResponses,
      keyIssued: keyIssued || false,
      dueDate,
      fileUrl,
      status: normalizeStatus(req.body.status),
      dynamicStatus: defaultStatus._id,
      createdBy: req.user._id,
    });

    sendSuccess(res, "Work order created successfully", { workOrder }, 201);

    // ── Notify AFTER response ────────────────────────────────────────
    if (assignmentType === "direct" && vendor) {
      await notifyVendorAssigned(workOrder, [vendor]);
    } else if (assignmentType === "company") {
      const vendorIds = vendorResponses.map((v) => v.user);
      await notifyVendorAssigned(workOrder, vendorIds);
    }
  } catch (err) {
    return sendError(res, err.message || "Failed to create work order", 500);
  }
};

// Shared fan-out notifier
async function notifyVendorAssigned(workOrder, vendorIds) {
  await Promise.all(
    vendorIds.map((vendorId) =>
      createNotification({
        user: vendorId,
        role: "Vendor",
        type: "WORK_ORDER_ASSIGNED",
        title: "New Work Order Available",
        message: `A new work order (${workOrder.workOrderNumber}) is available. Please Accept or Decline.`,
        entityType: "WorkOrder",
        entityId: workOrder._id,
      }),
    ),
  );

  const io = getIO();
  vendorIds.forEach((vendorId) => {
    io.to(`user:${vendorId.toString()}`).emit("vendor:new-work-order", {
      workOrderId: workOrder._id,
      workOrderNumber: workOrder.workOrderNumber,
    });
  });
}

// Get all work orders
exports.getWorkOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const allowedUserIds = await resolveTeamUserIds(req.user);

    let filter = {};

    // ── Apply team scope — null means Admin (no restriction) ──
    if (allowedUserIds !== null) {
      filter.$or = [
        { createdBy: { $in: allowedUserIds } }, // created by team
        { assignedTo: { $in: allowedUserIds } }, // assigned to team
      ];
    }

    const {
      status,
      dynamicStatus,
      category,
      company,
      vendor,
      building,
      city,
      portfolio,
      tenancy,
      search,
    } = req.query;

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

    if (company && company !== "All") {
      const companyScope = await buildCompanyScopeFilter(company);
      filter.$and = (filter.$and || []).concat(companyScope);
    } else if (vendor && vendor !== "All") {
      filter.vendor = vendor;
    }

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
              (id) => id.toString() === filter.building.toString(),
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
          buildingIdsByCity.includes(id),
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
      .populate({
        path: "vendor",
        select: "technicianName email company",
        populate: { path: "company", select: "companyName" },
      })
      .populate("assignedCompany", "companyName")
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

    let filter = {
      $or: [
        { vendor: vendorId },
        {
          "vendorResponses.user": vendorId,
          "vendorResponses.response": "pending",
        }, // company invite awaiting my response
      ],
    };

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
        "formData.address formData.fullAddress formData.city formData.keyNumber formData.lockCode buildingAbbreviation status",
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
          "vendorResponses.user": vendorId,
          "vendorResponses.response": "pending",
          "vendorResponses.seenAt": null,
        },
        {
          $set: { "vendorResponses.$[elem].seenAt": new Date() },
        },
        {
          arrayFilters: [{ "elem.user": vendorId, "elem.response": "pending" }],
        },
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
    const {
      buildingId,
      page = 1,
      limit = 10,
      status,
      vendor,
      category,
      workOrderType,
      dueDate,
      dynamicStatus,
    } = req.query;

    if (!buildingId) {
      return sendError(res, "Building ID is required", 400);
    }

    const skip = (page - 1) * limit;
    const filter = { building: buildingId };

    // Status (primary: open/closed)
    if (status && status !== "All") {
      filter.status = status;
    }

    // Dynamic status (by ID)
    if (dynamicStatus && dynamicStatus !== "All") {
      const statusObj = await WODynamicStatus.findOne({
        $or: [
          {
            _id: mongoose.Types.ObjectId.isValid(dynamicStatus)
              ? dynamicStatus
              : null,
          },
          { name: new RegExp(dynamicStatus, "i") },
        ].filter(Boolean),
      });
      if (statusObj) filter.dynamicStatus = statusObj._id;
    }

    // Vendor
    if (vendor && vendor !== "All") filter.vendor = vendor;

    // Category
    if (category && category !== "All") filter.category = category;

    // Work Order Type
    if (workOrderType && workOrderType !== "All")
      filter.workOrderType = workOrderType;

    // Due Date (exact day range)
    if (dueDate && dueDate !== "All") {
      const start = new Date(dueDate);
      const end = new Date(dueDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      filter.dueDate = { $gte: start, $lte: end };
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
      500,
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
      .populate({
        path: "vendor",
        select: "technicianName email company",
        populate: { path: "company", select: "companyName" },
      })
      .populate("assignedCompany", "companyName")
      .populate("createdBy", "preferredName email")
      .populate("dynamicStatus", "name description isDefault")
      .populate("assignedTo", "preferredName email");

    if (!workOrder) return sendError(res, "Work order not found", 404);

    let categoryName = null;
    if (workOrder.category) {
      if (mongoose.Types.ObjectId.isValid(workOrder.category)) {
        const cat = await Category.findById(workOrder.category).select("name");
        categoryName = cat?.name || null;
      } else {
        categoryName = workOrder.category;
      }
    }
    const woObj = workOrder.toObject();
    const assignedToDisplay =
      woObj.assignedTo?.preferredName ||
      woObj.vendor?.company?.companyName ||
      woObj.assignedCompany?.companyName ||
      null;

    const dyn = workOrder.dynamicStatus?.name ?? "";
    const canEdit =
      workOrder.status === "open" && !["Completed", "Declined"].includes(dyn);

    return sendSuccess(res, "Work order fetched successfully", {
      workOrder: {
        ...woObj,
        categoryName,
        assignedToDisplay,
        canEditStatus: canEdit,
      },
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch work order", 500);
  }
};

// Get WorkOrder summary for Reassign
exports.getWorkOrderReassignSummary = async (req, res) => {
  try {
    const { id } = req.params;

    const workOrder = await WorkOrder.findById(id)
      .select("workOrderNumber workOrderType category building status")
      .populate({
        path: "building",
        select: "buildingAbbreviation formData.address",
      })
      .lean();

    if (!workOrder) return sendError(res, "Work order not found", 404);

    let categoryName = workOrder.category || "—";
    if (
      workOrder.category &&
      mongoose.Types.ObjectId.isValid(workOrder.category)
    ) {
      const cat = await Category.findById(workOrder.category).select("name");
      categoryName = cat?.name || workOrder.category;
    }

    return sendSuccess(res, "Work order summary fetched", {
      workOrder: {
        _id: workOrder._id,
        workOrderNumber: workOrder.workOrderNumber,
        workOrderType: workOrder.workOrderType,
        category: categoryName,
        address: workOrder.building?.formData?.address || "—",
        status: workOrder.status,
      },
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch work order summary",
      500,
    );
  }
};

// Update Work Order
exports.updateWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    if (updateData.dueDate) {
      validateFutureOrTodayDate(updateData.dueDate, "Due date");
    }

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
        "uploads/Repair/workOrders",
      );
    }

    if (updateData.dynamicStatus) {
      const statusExists = await WODynamicStatus.findById(
        updateData.dynamicStatus,
      );
      if (!statusExists) return sendError(res, "Invalid dynamic status", 400);
    }

    const incomingCompany = updateData.company;
    const currentCompany = workOrder.assignedCompany?.toString();
    const companyChanged =
      incomingCompany && incomingCompany !== currentCompany;

    // Never let "company" leak into a raw findByIdAndUpdate — it isn't a real field
    delete updateData.company;

    if (companyChanged) {
      if (!["Admin", "OfficeAdmin"].includes(req.user.role)) {
        return sendError(
          res,
          "Only Admin or Office Admin can reassign the vendor company",
          403,
        );
      }

      const vendorIds = await resolveCompanyVendorIds(incomingCompany);
      if (vendorIds.length === 0) {
        return sendError(
          res,
          "This company has no active vendor users to assign",
          400,
        );
      }

      const defaultStatus = await WODynamicStatus.findOne({ isDefault: true });
      if (!defaultStatus) {
        return sendError(
          res,
          "No default dynamic status set. Please configure one.",
          400,
        );
      }

      await cancelAllReminders(workOrder._id);

      updateData.assignmentType = "company";
      updateData.assignedCompany = incomingCompany;
      updateData.vendor = null;
      updateData.vendorResponses = vendorIds.map((userId) => ({
        user: userId,
        response: "pending",
      }));
      updateData.vendorResponse = "pending";
      updateData.dynamicStatus = updateData.dynamicStatus || defaultStatus._id;
      updateData.declinedDate = null;
      updateData.vendorSeenAt = null;
      updateData.reassignedAt = new Date();
      updateData.reassignedBy = req.user._id;

      const updated = await WorkOrder.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      })
        .populate("dynamicStatus", "name description")
        .populate("assignedCompany", "companyName");

      // Fire-and-forget notify — same helper already used at create time
      notifyVendorAssigned(updated, vendorIds).catch(console.error);

      return sendSuccess(
        res,
        "Work order updated and reassigned successfully",
        {
          workOrder: updated,
        },
      );
    }

    // ── No company change — behave exactly as before ───────────────────
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

// Update work order status
exports.updateWorkOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const workOrder = await WorkOrder.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true },
    );

    if (!workOrder) return sendError(res, "Work order not found", 404);

    return sendSuccess(res, "Work order status updated successfully", {
      workOrder,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to update work order status",
      500,
    );
  }
};

// Vendor Accept Work Order
exports.vendorAcceptWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.user._id;

    const wo = await WorkOrder.findById(id);
    if (!wo) return sendError(res, "Work order not found", 404);

    if (wo.assignmentType === "direct") {
      // ── Legacy single-vendor path (unchanged behavior) ──────────
      if (!wo.vendor || wo.vendor.toString() !== vendorId.toString()) {
        return sendError(
          res,
          "You are not allowed to accept this work order",
          403,
        );
      }
      if (wo.vendorResponse !== "pending") {
        return sendError(res, "Work order already responded", 400);
      }
      wo.vendorResponse = "accepted";
      await wo.save();
      return sendSuccess(res, "Work order accepted", { workOrder: wo });
    }

    // ── Company pool path ───────────────────────────────────────────
    const invited = wo.vendorResponses?.find(
      (r) => r.user.toString() === vendorId.toString(),
    );
    if (!invited) {
      return sendError(
        res,
        "You are not invited to respond to this work order",
        403,
      );
    }
    if (invited.response !== "pending") {
      return sendError(
        res,
        "You have already responded to this work order",
        400,
      );
    }

    // Atomic claim: only succeeds if nobody has claimed it yet (vendor === null)
    const claimed = await WorkOrder.findOneAndUpdate(
      {
        _id: id,
        vendor: null,
        "vendorResponses.user": vendorId,
        "vendorResponses.response": "pending",
      },
      {
        $set: {
          vendor: vendorId,
          vendorResponse: "accepted",
          "vendorResponses.$.response": "accepted",
          "vendorResponses.$.respondedAt": new Date(),
        },
      },
      { new: true },
    );

    if (!claimed) {
      // Someone else already claimed it in the meantime
      return sendError(
        res,
        "This work order has already been accepted by another team member",
        409,
      );
    }

    // Mark everyone else invited as "superseded" and stop their reminders
    const otherVendorIds = claimed.vendorResponses
      .filter(
        (r) =>
          r.user.toString() !== vendorId.toString() && r.response === "pending",
      )
      .map((r) => r.user);

    if (otherVendorIds.length > 0) {
      await WorkOrder.updateOne(
        { _id: id },
        {
          $set: {
            "vendorResponses.$[elem].response": "superseded",
            "vendorResponses.$[elem].respondedAt": new Date(),
          },
        },
        {
          arrayFilters: [
            {
              "elem.user": { $in: otherVendorIds },
              "elem.response": "pending",
            },
          ],
        },
      );

      // Notify the losing vendors so it drops off their pending list
      const io = getIO();
      otherVendorIds.forEach((otherId) => {
        io.to(`user:${otherId.toString()}`).emit("vendor:work-order-claimed", {
          workOrderId: id,
        });
      });
    }

    return sendSuccess(res, "Work order accepted", { workOrder: claimed });
  } catch (err) {
    return sendError(res, err.message || "Failed to accept work order", 500);
  }
};

// Vendor Decline Work Order
exports.vendorDeclineWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.user._id;

    const declinedStatus = await WODynamicStatus.findOne({ name: "Declined" });
    if (!declinedStatus) return sendError(res, "Declined status missing", 400);

    const wo = await WorkOrder.findById(id);
    if (!wo) return sendError(res, "Work order not found", 404);

    if (wo.assignmentType === "direct") {
      // ── Legacy path (unchanged) ─────────────────────────────────
      if (!wo.vendor || wo.vendor.toString() !== vendorId.toString()) {
        return sendError(
          res,
          "You are not allowed to decline this work order",
          403,
        );
      }
      if (wo.vendorResponse !== "pending") {
        return sendError(res, "Work order already responded", 400);
      }
      wo.vendorResponse = "declined";
      wo.dynamicStatus = declinedStatus._id;
      wo.declinedDate = new Date();
      wo.status = "open";
      await wo.save();
      return sendSuccess(res, "Work order declined", { workOrder: wo });
    }

    // ── Company pool path ───────────────────────────────────────────
    const invited = wo.vendorResponses?.find(
      (r) => r.user.toString() === vendorId.toString(),
    );
    if (!invited)
      return sendError(
        res,
        "You are not invited to respond to this work order",
        403,
      );
    if (invited.response !== "pending") {
      return sendError(
        res,
        "You have already responded to this work order",
        400,
      );
    }

    const updated = await WorkOrder.findOneAndUpdate(
      {
        _id: id,
        "vendorResponses.user": vendorId,
        "vendorResponses.response": "pending",
      },
      {
        $set: {
          "vendorResponses.$.response": "declined",
          "vendorResponses.$.respondedAt": new Date(),
        },
      },
      { new: true },
    );

    // Only escalate to overall "declined" if EVERY invited vendor has declined
    const allDeclined = updated.vendorResponses.every(
      (r) => r.response === "declined",
    );
    if (allDeclined) {
      updated.vendorResponse = "declined";
      updated.dynamicStatus = declinedStatus._id;
      updated.declinedDate = new Date();
      await updated.save();

      await notifyInternalUsers({
        eventType: "WORK_ORDER_ALL_VENDORS_DECLINED",
        title: "Work Order Declined by All Vendors",
        message: `No vendor at the assigned company accepted ${updated.workOrderNumber}. Please reassign.`,
        entityType: "WorkOrder",
        entityId: updated._id,
      }).catch(console.error);
    }

    return sendSuccess(res, "Work order declined", { workOrder: updated });
  } catch (err) {
    return sendError(res, err.message || "Failed to decline work order", 500);
  }
};

// Vendor Update Work Order
exports.vendorUpdateWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Only dynamicStatus is allowed
    const allowed = ["dynamicStatus"];
    const invalid = Object.keys(updates).filter(
      (key) => !allowed.includes(key),
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
          403,
        );
      }
    }

    const workOrder = await WorkOrder.findById(id);
    if (!workOrder) return sendError(res, "Work order not found", 404);

    // Ensure vendor owns the work order
    if (workOrder.vendor.toString() !== req.user._id.toString()) {
      return sendError(res, "Unauthorized vendor", 403);
    }
    assertVendorAccepted(workOrder);

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
        400,
      );
    }

    // BLOCK if primary status is closed
    if (workOrder.status === "closed") {
      return sendError(
        res,
        "You cannot update status because the work order is already closed",
        400,
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
      "name description",
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
        403,
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
        403,
      );
    }

    for (const wo of workOrders) {
      const dyn = await WODynamicStatus.findById(wo.dynamicStatus);
      const dynName = dyn?.name;

      if (["Completed", "Declined"].includes(dynName)) {
        return sendError(
          res,
          `Cannot update Work Order ${wo.workOrderNumber} because its status is already ${dynName}`,
          400,
        );
      }

      if (wo.status === "closed") {
        return sendError(
          res,
          `Cannot update Work Order ${wo.workOrderNumber} because it is already closed`,
          400,
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
        400,
      );
    }

    const maxAllowedDate = addMonths(currentDueDate, 3);
    if (requested > maxAllowedDate) {
      return sendError(
        res,
        "Extension request cannot exceed 3 months from the current due date",
        400,
      );
    }

    if (!workOrder.vendor) {
      return sendError(
        res,
        "This work order is not assigned to any vendor",
        403,
      );
    }

    if (workOrder.vendor.toString() !== req.user._id.toString()) {
      return sendError(
        res,
        "You can request an extension only for work orders assigned to you",
        403,
      );
    }
    assertVendorAccepted(workOrder);

    if (workOrder.status === "closed") {
      return sendError(
        res,
        "Cannot request due date extension for a closed work order",
        400,
      );
    }

    const dyn = await WODynamicStatus.findById(workOrder.dynamicStatus);
    if (["Completed", "Declined"].includes(dyn?.name)) {
      return sendError(
        res,
        "Cannot request extension for completed or declined work order",
        400,
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
        400,
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

    getIO()
      .to(`workorder:${workOrder._id}`)
      .emit("timeline:new-item", {
        workOrderId: workOrder._id,
        item: {
          _id: "extension_current",
          type: "extension_request",
          description: reason,
          requestedDate,
          status: "pending",
          createdBy: req.user._id,
          createdAt: new Date(),
        },
      });

    await notifyInternalUsers({
      eventType: "DUE_DATE_EXTENSION_REQUESTED",
      title: "Due Date Extension Requested",
      message: `Vendor requested a due date extension for ${workOrder.workOrderNumber}. Please review.`,
      entityType: "WorkOrder",
      entityId: workOrder._id,
    }).catch(console.error);

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
        403,
      );
    }

    if (!["approved", "rejected"].includes(action)) {
      return sendError(res, "Invalid action", 400);
    }

    if (action === "rejected" && (!remarks || !remarks.trim())) {
      return sendError(
        res,
        "Remarks are mandatory when rejecting an extension request",
        400,
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

    // Clear current extension
    workOrder.dueDateExtension = undefined;

    workOrder.markModified("dueDate");
    workOrder.markModified("dueDateExtension");
    workOrder.markModified("dueDateExtensionHistory");
    await workOrder.save();

    if (workOrder.vendor) {
      await createNotification({
        user: workOrder.vendor,
        role: "Vendor",
        type: "DUE_DATE_EXTENSION_REVIEWED",
        title:
          action === "approved"
            ? "Due Date Extension Approved"
            : "Due Date Extension Rejected",
        message:
          action === "approved"
            ? `Your extension request for ${workOrder.workOrderNumber} was approved. New due date: ${new Date(workOrder.dueDate).toLocaleDateString()}.`
            : `Your extension request for ${workOrder.workOrderNumber} was rejected.${remarks ? ` Reason: ${remarks}` : ""}`,
        entityType: "WorkOrder",
        entityId: workOrder._id,
      }).catch(console.error);
    }

    // Notify vendor
    getIO()
      .to(`user:${workOrder.vendor}`)
      .emit("work-order:due-date-extension-reviewed", {
        workOrderId: workOrder._id,
        status: action,
        newDueDate: workOrder.dueDate,
        remarks: remarks,
      });

    getIO()
      .to(`workorder:${workOrder._id}`)
      .emit("timeline:new-item", {
        workOrderId: workOrder._id,
        item: {
          _id: `extension_review_${Date.now()}`,
          type: "extension_review",
          description: remarks,
          status: action, // approved | rejected
          createdBy: req.user._id,
          createdAt: new Date(),
        },
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

    if (req.user.role === "Vendor") {
      if (
        !workOrder.vendor ||
        workOrder.vendor.toString() !== req.user._id.toString()
      ) {
        return sendError(res, "Not authorized", 403);
      }
      assertVendorAccepted(workOrder);
    }

    if (invoiceOption === "upload_now") {
      if (!req.body.invoiceId) {
        return sendError(
          res,
          "Invoice must be uploaded and confirmed first",
          400,
        );
      }
      await finalizeInvoice(workOrder, req.body.invoiceId, req.user._id);
      // ── Assign bill number now that the invoice is finalized ──────────
      await assignBillNumberIfMissing(req.body.invoiceId);
    }

    if (workOrder.keyIssued === true && !keyReturnOption) {
      return sendError(
        res,
        "Key return selection is mandatory because a key was issued",
        400,
      );
    }

    // if (workOrder.keyIssued) {
    //   if (finalKeyOption === "returned_now") {
    //     workOrder.keyIssued = false;
    //     workOrder.keyReturnStatus = "Returned";
    //   } else if (finalKeyOption === "return_later") {
    //     workOrder.keyReturnStatus = "Return Later";
    //   }
    // }    let invoiceUrl = null;

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
        const invoiceUrl = await uploadFile(file, "uploads/invoices");

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

    if (invoiceOption === "upload_later") {
      workOrder.invoiceUploaded = false;
      workOrder.invoicePending = true;

      // ── EXISTING one-shot notification (keep as-is) ──────────────────────
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

    if (note) {
      let vendorCategory = await NoteCategory.findOne({ name: "Vendor" });
      if (!vendorCategory) {
        vendorCategory = await NoteCategory.create({
          name: "Vendor",
          createdBy: req.user._id,
        });
      }

      const createdNote = await Note.create({
        workOrder: id,
        category: vendorCategory._id,
        subject: "Completion Note",
        description: note,
        createdBy: req.user._id,
      });

      getIO()
        .to(`workorder:${id}`)
        .emit("timeline:new-item", {
          workOrderId: id,
          item: {
            _id: createdNote._id,
            type: "note",
            description: createdNote.description,
            createdBy: req.user._id,
            createdAt: createdNote.createdAt,
          },
        });
    }

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

    await notifyInternalUsers({
      eventType: "WORK_ORDER_COMPLETED",
      title: "Work Order Completed",
      message: `${workOrder.workOrderNumber} marked completed by vendor`,
      entityType: "WorkOrder",
      entityId: workOrder._id,
      metadata: {
        workOrderNumber: workOrder.workOrderNumber,
        buildingId: workOrder.building,
        vendorId: workOrder.vendor,
      },
    }).catch(console.error);

    // ── REMINDER ENGINE: schedule recurring reminders ─────────────────────
    // Invoice reminder — only when vendor chose "upload later"
    if (workOrder.invoicePending) {
      await scheduleReminder({
        reminderType: "INVOICE_UPLOAD_PENDING",
        entityType: "WorkOrder",
        entityId: workOrder._id,
        userId: workOrder.vendor,
        role: "Vendor",
        cycleId: "VENDOR_DEFAULT",
        title: "Invoice Upload Pending",
        message: `Please upload the invoice for work order ${workOrder.workOrderNumber}.`,
        metadata: { workOrderNumber: workOrder.workOrderNumber },
      });
    }

    // Key return reminder — only when key was issued and vendor chose "return later"
    if (workOrder.keyReturn?.status === "pending") {
      await scheduleReminder({
        reminderType: "KEY_RETURN_PENDING",
        entityType: "WorkOrder",
        entityId: workOrder._id,
        userId: workOrder.vendor,
        role: "Vendor",
        cycleId: "VENDOR_DEFAULT",
        title: "Key Return Pending",
        message: `Please confirm key return for work order ${workOrder.workOrderNumber}.`,
        metadata: { workOrderNumber: workOrder.workOrderNumber },
      });
    }
    // ─────────────────────────────────────────────────────────────────────

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
      "name",
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
        400,
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

    await notifyInternalUsers({
      eventType: "INVOICE_UPLOADED",
      title: "Invoice Uploaded",
      message: `Invoice uploaded for ${workOrder.workOrderNumber}`,
      entityType: "WorkOrder",
      entityId: workOrder._id,
    }).catch(console.error);

    // ── REMINDER ENGINE: stop invoice reminders — action is done ─────────
    await resolveReminders(workOrder._id, "INVOICE_UPLOAD_PENDING");

    return sendSuccess(res, "Invoice uploaded successfully", { workOrder });
  } catch (err) {
    return sendError(res, err.message || "Failed to upload invoice", 500);
  }
};

exports.vendorConfirmKeyReturn = async (req, res) => {
  const { id } = req.params;

  const workOrder = await WorkOrder.findById(id).populate(
    "dynamicStatus",
    "name",
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

  await notifyInternalUsers({
    eventType: "KEY_RETURNED",
    title: "Keys Returned",
    message: `Keys returned for ${workOrder.workOrderNumber}`,
    entityType: "WorkOrder",
    entityId: workOrder._id,
  }).catch(console.error);

  // ── REMINDER ENGINE: stop key return reminders — action is done ───────
  await resolveReminders(workOrder._id, "KEY_RETURN_PENDING");

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
        403,
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
      },
    );

    // getIO().to(`vendor:${vendorId}`).emit("work-order:key-returned", {
    //   workOrderIds: eligibleIds,
    // });

    // ── REMINDER ENGINE: resolve key reminders for all confirmed IDs ──────
    await Promise.all(
      eligibleIds.map((entityId) =>
        resolveReminders(entityId, "KEY_RETURN_PENDING"),
      ),
    );

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
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || DEFAULT_LIMIT;
    const skip = (page - 1) * limit;
    const includeMeta = req.query.includeMeta === "true";

    const workOrder = await WorkOrder.findById(workOrderId)
      .populate(
        "dueDateExtension.requestedBy",
        "preferredName email profileImage",
      )
      .populate(
        "dueDateExtension.reviewedBy",
        "preferredName email profileImage",
      )
      .populate(
        "dueDateExtensionHistory.requestedBy",
        "preferredName email profileImage",
      )
      .populate(
        "dueDateExtensionHistory.reviewedBy",
        "preferredName email profileImage",
      );

    if (!workOrder) {
      return sendError(res, "Work order not found", 404);
    }

    // NOTES — PAGINATED
    const notes = await Note.find({ workOrder: workOrderId })
      .populate("category", "name")
      .populate("createdBy", "preferredName technicianName email profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    let timelineItems = [];

    notes.forEach((note) => {
      timelineItems.push({
        _id: note._id,
        type: "note",
        description: note.description,
        category: note.category,
        createdBy: note.createdBy,
        createdAt: note.createdAt,
      });
    });

    // EXTENSIONS (only once – first page)
    if (page === 1 && includeMeta) {
      if (workOrder.dueDateExtension?.reason) {
        timelineItems.push({
          _id: "extension_current",
          type: "extension_request",
          description: workOrder.dueDateExtension.reason,
          requestedDate: workOrder.dueDateExtension.requestedDate,
          status: workOrder.dueDateExtension.status,
          createdBy: workOrder.dueDateExtension.requestedBy,
          createdAt: workOrder.dueDateExtension.requestedAt,
        });
      }

      workOrder.dueDateExtensionHistory?.forEach((ext, index) => {
        timelineItems.push({
          _id: `extension_request_${index}`,
          type: "extension_request",
          description: ext.reason,
          requestedDate: ext.requestedDate,
          status: ext.status,
          createdBy: ext.requestedBy,
          createdAt: ext.requestedAt,
        });

        if (ext.reviewRemarks) {
          timelineItems.push({
            _id: `extension_review_${index}`,
            type: "extension_review",
            description: ext.reviewRemarks,
            status: ext.status,
            createdBy: ext.reviewedBy,
            createdAt: ext.reviewedAt,
          });
        }
      });
    }

    const totalNotes = await Note.countDocuments({ workOrder: workOrderId });

    timelineItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return sendSuccess(res, "Timeline fetched", {
      timeline: timelineItems,
      pagination: {
        page,
        limit,
        hasMore: skip + notes.length < totalNotes,
      },
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch timeline", 500);
  }
};

// Count work orders assigned to vendor
exports.getVendorNewWorkOrderCount = async (req, res) => {
  try {
    const vendorId = req.user._id;

    const count = await WorkOrder.countDocuments({
      // vendor: vendorId,
      // vendorResponse: "pending",
      status: "open",
      $or: [
        {
          vendor: vendorId,
          vendorResponse: "pending",
          vendorSeenAt: null,
        },

        {
          vendorResponses: {
            $elemMatch: {
              user: vendorId,
              response: "pending",
              seenAt: null,
            },
          },
        },
      ],
      // vendorSeenAt: null,
    });

    return sendSuccess(res, "New work order count fetched", { count });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch count", 500);
  }
};

// Vendor Chat Work Orders
exports.getVendorChatWorkOrders = async (req, res) => {
  try {
    const vendorId = req.user._id;

    const workOrders = await WorkOrder.find({
      vendor: vendorId,
    })
      .select("_id workOrderNumber status")
      .populate({
        path: "building",
        select: "formData.address",
      })
      .sort({ createdAt: -1 });

    return sendSuccess(res, "Chat work orders fetched", {
      workOrders,
    });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// Delete Work Order
exports.deleteWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const workOrder = await WorkOrder.findById(id);

    if (!workOrder) return sendError(res, "Work order not found", 404);
    if (workOrder.fileUrl) await deleteFile(workOrder.fileUrl);

    // ── REMINDER ENGINE: cancel any active reminders for this entity ──────
    await cancelAllReminders(workOrder._id);

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
      // ── REMINDER ENGINE: cancel reminders per entity ───────────────────
      await cancelAllReminders(wo._id);
    }

    const result = await WorkOrder.deleteMany({ _id: { $in: ids } });
    return sendSuccess(
      res,
      `${result.deletedCount} work orders deleted successfully`,
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
      assertVendorAccepted(workOrder);
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

// Reopen Work Order
exports.reopenWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;

    const workOrder = await WorkOrder.findById(id);

    if (!workOrder) {
      return sendError(res, "Work order not found", 404);
    }

    if (workOrder.status !== "closed") {
      return sendError(res, "Only closed work orders can be reopened", 400);
    }

    workOrder.status = "open";
    workOrder.reopenComments = comments || null;
    workOrder.reopenedAt = new Date();
    workOrder.reopenedBy = req.user._id;
    workOrder.completeDate = null;

    await workOrder.save();

    return sendSuccess(res, "Work order reopened successfully", {
      workOrder,
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to reopen work order", 500);
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
      },
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

// ── Reassign Work Order (Admin / OfficeAdmin only) ──────────────────────
exports.reassignWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { targetType, assignTo } = req.body; // "vendor" | "company"

    if (!["Admin", "OfficeAdmin"].includes(req.user.role)) {
      return sendError(
        res,
        "Only Admin or Office Admin can reassign work orders",
        403,
      );
    }
    if (!["vendor", "company"].includes(targetType)) {
      return sendError(res, "targetType must be 'vendor' or 'company'", 400);
    }
    if (!assignTo) return sendError(res, "assignTo is required", 400);

    const workOrder = await WorkOrder.findById(id);
    if (!workOrder) return sendError(res, "Work order not found", 404);
    if (workOrder.status === "closed") {
      return sendError(res, "Cannot reassign a closed work order", 400);
    }

    const defaultStatus = await WODynamicStatus.findOne({ isDefault: true });
    if (!defaultStatus) {
      return sendError(
        res,
        "No default dynamic status set. Please configure one.",
        400,
      );
    }

    await cancelAllReminders(workOrder._id);

    let vendorIdsToNotify = [];

    if (targetType === "vendor") {
      const vendorUser = await User.findOne({
        _id: assignTo,
        role: "Vendor",
        isActive: true,
      });
      if (!vendorUser)
        return sendError(res, "Vendor not found or inactive", 400);

      workOrder.assignmentType = "direct";
      workOrder.assignedCompany = undefined;
      workOrder.vendor = vendorUser._id;
      workOrder.vendorResponses = [];
      vendorIdsToNotify = [vendorUser._id];
    } else {
      const vendorIds = await resolveCompanyVendorIds(assignTo);
      if (vendorIds.length === 0) {
        return sendError(
          res,
          "This company has no active vendor users to assign",
          400,
        );
      }

      workOrder.assignmentType = "company";
      workOrder.assignedCompany = assignTo;
      workOrder.vendor = null;
      workOrder.vendorResponses = vendorIds.map((userId) => ({
        user: userId,
        response: "pending",
      }));
      vendorIdsToNotify = vendorIds;
    }

    workOrder.vendorResponse = "pending";
    workOrder.status = "open";
    workOrder.dynamicStatus = defaultStatus._id;
    workOrder.declinedDate = null;
    workOrder.vendorSeenAt = null;
    workOrder.reassignedAt = new Date();
    workOrder.reassignedBy = req.user._id;

    await workOrder.save();
    await notifyVendorAssigned(workOrder, vendorIdsToNotify);

    const populated = await WorkOrder.findById(id)
      .populate("vendor", "companyName technicianName")
      .populate("assignedCompany", "companyName");

    return sendSuccess(res, "Work order reassigned successfully", {
      workOrder: populated,
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to reassign work order", 500);
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

    if (dueDate) {
      validateFutureOrTodayDate(dueDate, "Due date");
    }

    // Generate inspection number
    const sequence = await getNextSequence("inspection");
    const inspectionNumber = `I #${sequence.toString().padStart(4, "0")}`;

    let keyReturn = {
      status: keyIssued ? "pending" : "not_issued",
    };

    const inspectionRequest = await InspectionRequest.create({
      inspectionNumber,
      inspectionType,
      building,
      notes,
      assignedTo,
      keyIssued: keyIssued || false,
      keyReturn,
      dueDate,
      inspectionColour,
      createdBy: req.user._id,
    });

    //  Send response FIRST — never let notification delay it
    sendSuccess(
      res,
      "Inspection request created successfully",
      { inspectionRequest },
      201,
    );

    //  Fire notification AFTER response — non-blocking
    // assignedTo is the clerk's userId from req.body
    if (assignedTo) {
      try {
        await createNotification({
          user: assignedTo,
          role: "InspectionClerk",
          type: "INSPECTION_REQUEST_ASSIGNED",
          title: "New Inspection Request Assigned",
          message: `Inspection request ${inspectionRequest.inspectionNumber} has been assigned to you.`,
          entityType: "InspectionRequest",
          entityId: inspectionRequest._id,
        });
        // NOTE: createNotification already emits the socket internally,
        // so no need for a separate getIO().emit() call here
      } catch (notifErr) {
        // Log but never crash the request over a notification failure
        console.error("Failed to send inspection notification:", notifErr);
      }
    }
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to create inspection request",
      500,
    );
  }
};

// Get all inspection requests
exports.getInspectionRequests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const allowedUserIds = await resolveTeamUserIds(req.user);

    let filter = {};

    // Scope to team
    if (allowedUserIds !== null) {
      filter.$or = [
        { createdBy: { $in: allowedUserIds } },
        { assignedTo: { $in: allowedUserIds } },
      ];
    }

    // InspectionClerk override — they only see their own assigned
    if (req.user.role === "InspectionClerk") {
      filter = { assignedTo: req.user._id };
    }

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
            buildingIdsByAddress.includes(id),
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
      500,
    );
  }
};

// Get single Inspection Request
exports.getInspectionRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const inspectionRequest = await InspectionRequest.findById(id)
      .populate({
        path: "building",
        select:
          "buildingAbbreviation formData.address formData.city formData.fullAddress portfolio",
        populate: {
          path: "portfolio",
          select: "portfolioAbbreviation formData.name",
        },
      })
      .populate("assignedTo", "preferredName email")
      .populate("createdBy", "preferredName email");

    if (!inspectionRequest) {
      return sendError(res, "Inspection request not found", 404);
    }

    return sendSuccess(res, "Inspection request fetched successfully", {
      inspectionRequest,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch inspection request",
      500,
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
      dueDate,
    } = req.query;

    if (!buildingId) return sendError(res, "Building ID is required", 400);

    const skip = (page - 1) * limit;
    const filter = { building: buildingId };

    if (status && status !== "All") filter.status = status;
    if (inspectionType && inspectionType !== "All")
      filter.inspectionType = inspectionType;
    if (assignedTo && assignedTo !== "All") filter.assignedTo = assignedTo;

    if (dueDate && dueDate !== "All") {
      const start = new Date(dueDate);
      const end = new Date(dueDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      filter.dueDate = { $gte: start, $lte: end };
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
      500,
    );
  }
};

// Update Inspection Request
exports.updateInspectionRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    if (updateData.dueDate) {
      validateFutureOrTodayDate(updateData.dueDate, "Due date");
    }

    // If scheduleDate is provided, mark status as scheduled
    if (updateData.scheduleDate) {
      updateData.status = "scheduled";
    }

    if (req.body.keyIssued !== undefined) {
      req.body.keyReturn = {
        status: req.body.keyIssued ? "pending" : "not_applicable",
      };
    }

    //  STEP 1: Fetch OLD record BEFORE update to compare assignee
    const oldRequest = await InspectionRequest.findById(id);
    if (!oldRequest) return sendError(res, "Inspection request not found", 404);

    //  STEP 2: Check if assignee is actually changing
    const oldAssignedTo = oldRequest.assignedTo?.toString();
    const newAssignedTo = updateData.assignedTo?.toString();
    const assigneeChanged = newAssignedTo && oldAssignedTo !== newAssignedTo;

    //  STEP 3: Do the update
    const inspectionRequest = await InspectionRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true },
    );

    // STEP 4: Send response immediately
    sendSuccess(res, "Inspection request updated successfully", {
      inspectionRequest,
    });

    // STEP 5: Fire notification after response if assignee changed
    if (assigneeChanged) {
      try {
        await createNotification({
          user: newAssignedTo,
          role: "InspectionClerk",
          type: "INSPECTION_REQUEST_ASSIGNED",
          title: "Inspection Request Assigned",
          message: `Inspection request ${inspectionRequest.inspectionNumber} has been assigned to you.`,
          entityType: "InspectionRequest",
          entityId: inspectionRequest._id,
        });
      } catch (notifErr) {
        console.error("Failed to send reassignment notification:", notifErr);
      }
    }
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to update inspection request",
      500,
    );
  }
};

// Key Return Update for Inspection Request
exports.confirmInspectionKeyReturn = async (req, res) => {
  const { id } = req.params;

  const inspection = await InspectionRequest.findById(id);
  if (!inspection) return sendError(res, "Inspection not found", 404);

  if (inspection.keyReturn?.status === "returned") {
    return sendError(res, "Key already returned", 400);
  }

  inspection.keyReturn = {
    status: "returned",
    returnedAt: new Date(),
    returnedBy: req.user._id,
  };

  await inspection.save();

  return sendSuccess(res, "Key returned successfully", { inspection });
};

// Bulk Key Return Update for Inspection Requests
exports.bulkConfirmInspectionKeyReturn = async (req, res) => {
  const { ids } = req.body;

  await InspectionRequest.updateMany(
    { _id: { $in: ids } },
    {
      $set: {
        "keyReturn.status": "returned",
        "keyReturn.returnedAt": new Date(),
        "keyReturn.returnedBy": req.user._id,
      },
    },
  );

  return sendSuccess(res, "Keys returned successfully");
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
      },
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

// Reopen Inspection request
exports.reopenInspectionRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;

    const inspection = await InspectionRequest.findById(id);

    if (!inspection) {
      return sendError(res, "Inspection request not found", 404);
    }

    if (inspection.status !== "closed") {
      return sendError(
        res,
        "Only closed inspection requests can be reopened",
        400,
      );
    }

    inspection.status = "pending";
    inspection.completeDate = null;
    inspection.closingComments = null;

    inspection.reopenComments = comments || "";
    inspection.reopenedAt = new Date();
    inspection.reopenedBy = req.user._id;

    await inspection.save();

    return sendSuccess(res, "Inspection request reopened successfully", {
      inspectionRequest: inspection,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to reopen inspection request",
      500,
    );
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
      500,
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
      201,
    );
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to create service agreement",
      500,
    );
  }
};

// Get all service agreements
exports.getServiceAgreements = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const allowedUserIds = await resolveTeamUserIds(req.user);

    let filter = {};

    if (allowedUserIds !== null) {
      filter.createdBy = { $in: allowedUserIds };
      // Service agreements don't have assignedTo — createdBy is enough
    }

    const {
      dueDate,
      category,
      company,
      vendor,
      building,
      portfolio,
      vendorStatus,
      search,
    } = req.query;

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

    if (company && company !== "All") {
      const companyScope = await buildCompanyScopeFilter(company);
      filter.$and = (filter.$and || []).concat(companyScope);
    } else if (vendor && vendor !== "All") {
      filter.vendor = vendor;
    }

    //  Vendor
    if (vendor && vendor !== "All") {
      filter.vendor = vendor; // expecting vendorId
    }

    //  Vendor Status (via User collection lookup)
    if (vendorStatus && vendorStatus !== "All") {
      const vendorIds = await User.find({ status: vendorStatus }).distinct(
        "_id",
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
      .populate({
        path: "vendor",
        select: "technicianName email company",
        populate: { path: "company", select: "companyName" },
      })
      .populate("assignedCompany", "companyName")
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
      500,
    );
  }
};

// Get Service Agreement by ID
exports.getServiceAgreementById = async (req, res) => {
  try {
    const { id } = req.params;

    const serviceAgreement = await ServiceAgreement.findById(id)
      .populate({
        path: "building",
        select:
          "buildingAbbreviation formData.city formData.address formData.fullAddress portfolio",
        populate: {
          path: "portfolio",
          select: "portfolioAbbreviation formData.name",
        },
      })
      .populate({
        path: "vendor",
        select: "technicianName email company",
        populate: { path: "company", select: "companyName" },
      })
      .populate("assignedCompany", "companyName")
      .populate("createdBy", "preferredName email");

    if (!serviceAgreement) {
      return sendError(res, "Service agreement not found", 404);
    }

    let categoryName = null;
    let categoryId = null;

    if (serviceAgreement.category) {
      if (mongoose.Types.ObjectId.isValid(serviceAgreement.category)) {
        // Stored as ObjectId string
        const cat = await Category.findById(serviceAgreement.category).select(
          "name",
        );
        categoryName = cat?.name || null;
        categoryId = serviceAgreement.category;
      } else {
        // Stored as plain name string (legacy)
        categoryName = serviceAgreement.category;
        // Try to find the _id so FE can pre-select it in the edit modal
        const cat = await Category.findOne({
          name: serviceAgreement.category,
        }).select("_id name");
        categoryId = cat?._id?.toString() || null;
      }
    }

    return sendSuccess(res, "Service agreement fetched successfully", {
      serviceAgreement: {
        ...serviceAgreement.toObject(),
        categoryName,
        categoryId,
      },
    });
  } catch (err) {
    console.error("getServiceAgreementById error:", err.message);
    return sendError(
      res,
      err.message || "Failed to fetch service agreement",
      500,
    );
  }
};

// Get Service Agreements by Building
exports.getServiceAgreementsByBuilding = async (req, res) => {
  try {
    const {
      buildingId,
      page = 1,
      limit = 10,
      status,
      vendor,
      category,
      dueDate,
    } = req.query;

    if (!buildingId) return sendError(res, "Building ID is required", 400);

    const skip = (page - 1) * limit;
    const filter = { building: buildingId };

    if (status && status !== "All") filter.status = status;
    if (vendor && vendor !== "All") filter.vendor = vendor;
    if (category && category !== "All") filter.category = category;

    if (dueDate && dueDate !== "All") {
      const start = new Date(dueDate);
      const end = new Date(dueDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      filter.initialDueDate = { $gte: start, $lte: end };
    }

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
        .populate({
          path: "vendor",
          select: "technicianName email company",
          populate: { path: "company", select: "companyName" },
        })
        .populate("assignedCompany", "companyName")
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
      500,
    );
  }
};

// Get Service Agreement Summary for Reassign
exports.getServiceAgreementReassignSummary = async (req, res) => {
  try {
    const { id } = req.params;

    const sa = await ServiceAgreement.findById(id)
      .select("serviceAgreementNumber category building status")
      .populate({
        path: "building",
        select: "buildingAbbreviation formData.address",
      })
      .lean();

    if (!sa) return sendError(res, "Service agreement not found", 404);

    return sendSuccess(res, "Service agreement summary fetched", {
      serviceAgreement: {
        _id: sa._id,
        serviceAgreementNumber: sa.serviceAgreementNumber,
        category: sa.category,
        address: sa.building?.formData?.address || "—",
        status: sa.status,
      },
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch service agreement summary",
      500,
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
        "uploads/Repair/serviceAgreements",
      );
    }

    const incomingCompany = updateData.company;
    const currentCompany = serviceAgreement.assignedCompany?.toString();
    const companyChanged =
      incomingCompany && incomingCompany !== currentCompany;

    delete updateData.company;
    delete updateData.vendor;

    if (companyChanged) {
      if (!["Admin", "OfficeAdmin"].includes(req.user.role)) {
        return sendError(
          res,
          "Only Admin or Office Admin can reassign the vendor company",
          403,
        );
      }

      const vendorIds = await resolveCompanyVendorIds(incomingCompany);
      if (vendorIds.length === 0) {
        return sendError(
          res,
          "This company has no active vendor users to assign",
          400,
        );
      }

      updateData.assignmentType = "company";
      updateData.assignedCompany = incomingCompany;
      updateData.vendor = null;
      updateData.vendorResponses = vendorIds.map((userId) => ({
        user: userId,
        response: "pending",
      }));
      updateData.vendorResponse = "pending";
      updateData.declinedDate = null;
      updateData.vendorSeenAt = null;
      updateData.reassignedAt = new Date();
      updateData.reassignedBy = req.user._id;

      const updated = await ServiceAgreement.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      }).populate("assignedCompany", "companyName");

      await Promise.all(
        vendorIds.map((vendorId) =>
          createNotification({
            user: vendorId,
            role: "Vendor",
            type: "SERVICE_AGREEMENT_ASSIGNED",
            title: "Service Agreement Assigned to You",
            message: `Service agreement ${updated.serviceAgreementNumber} has been assigned. Please Accept or Decline.`,
            entityType: "ServiceAgreement",
            entityId: updated._id,
          }),
        ),
      ).catch(console.error);

      return sendSuccess(
        res,
        "Service agreement updated and reassigned successfully",
        { serviceAgreement: updated },
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
      500,
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
      500,
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
      `${result.deletedCount} service agreements deleted successfully`,
    );
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to bulk delete service agreements",
      500,
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
      },
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

// Reopen Service Agreement
exports.reopenServiceAgreement = async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;

    const serviceAgreement = await ServiceAgreement.findById(id);

    if (!serviceAgreement) {
      return sendError(res, "Service agreement not found", 404);
    }

    if (serviceAgreement.status !== "closed") {
      return sendError(
        res,
        "Only closed service agreements can be reopened",
        400,
      );
    }

    serviceAgreement.status = "open";
    serviceAgreement.closedAt = null;
    serviceAgreement.closingComments = null;

    serviceAgreement.reopenComments = comments || "";
    serviceAgreement.reopenedAt = new Date();
    serviceAgreement.reopenedBy = req.user._id;

    await serviceAgreement.save();

    return sendSuccess(res, "Service agreement reopened successfully", {
      serviceAgreement,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to reopen service agreement",
      500,
    );
  }
};

// ── Reassign Service Agreement (Admin / OfficeAdmin only) ───────────────
exports.reassignServiceAgreement = async (req, res) => {
  try {
    const { id } = req.params;
    const { targetType, assignTo } = req.body;

    if (!["Admin", "OfficeAdmin"].includes(req.user.role)) {
      return sendError(
        res,
        "Only Admin or Office Admin can reassign service agreements",
        403,
      );
    }
    if (!["vendor", "company"].includes(targetType)) {
      return sendError(res, "targetType must be 'vendor' or 'company'", 400);
    }
    if (!assignTo) return sendError(res, "assignTo is required", 400);

    const sa = await ServiceAgreement.findById(id);
    if (!sa) return sendError(res, "Service agreement not found", 404);
    if (sa.status === "closed") {
      return sendError(res, "Cannot reassign a closed service agreement", 400);
    }

    let vendorIdsToNotify = [];

    if (targetType === "vendor") {
      const vendorUser = await User.findOne({
        _id: assignTo,
        role: "Vendor",
        isActive: true,
      });
      if (!vendorUser)
        return sendError(res, "Vendor not found or inactive", 400);

      sa.assignmentType = "direct";
      sa.assignedCompany = undefined;
      sa.vendor = vendorUser._id;
      sa.vendorResponses = [];
      vendorIdsToNotify = [vendorUser._id];
    } else {
      const vendorIds = await resolveCompanyVendorIds(assignTo);
      if (vendorIds.length === 0) {
        return sendError(
          res,
          "This company has no active vendor users to assign",
          400,
        );
      }
      sa.assignmentType = "company";
      sa.assignedCompany = assignTo;
      sa.vendor = null;
      sa.vendorResponses = vendorIds.map((userId) => ({
        user: userId,
        response: "pending",
      }));
      vendorIdsToNotify = vendorIds;
    }

    sa.vendorResponse = "pending";
    sa.declinedDate = null;
    sa.vendorSeenAt = null;
    sa.reassignedAt = new Date();
    sa.reassignedBy = req.user._id;

    await sa.save();

    await Promise.all(
      vendorIdsToNotify.map((vendorId) =>
        createNotification({
          user: vendorId,
          role: "Vendor",
          type: "SERVICE_AGREEMENT_ASSIGNED",
          title: "Service Agreement Reassigned to You",
          message: `Service agreement ${sa.serviceAgreementNumber} has been reassigned. Please Accept or Decline.`,
          entityType: "ServiceAgreement",
          entityId: sa._id,
        }),
      ),
    );

    const populated = await ServiceAgreement.findById(id)
      .populate("vendor", "companyName technicianName")
      .populate("assignedCompany", "companyName");

    return sendSuccess(res, "Service agreement reassigned successfully", {
      serviceAgreement: populated,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to reassign service agreement",
      500,
    );
  }
};
