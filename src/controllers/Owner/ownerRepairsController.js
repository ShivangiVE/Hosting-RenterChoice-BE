const mongoose = require("mongoose");
const fs = require("fs");
const WorkOrder = require("../../models/WorkOrder");
const ServiceAgreement = require("../../models/ServiceAgreement");
const Category = require("../../models/repairCategories");
const User = require("../../models/User");
const WODynamicStatus = require("../../models/WODynamicStatus");
const { sendSuccess, sendError } = require("../../utils/response");
const { getOwnerDocumentScope } = require("../../utils/ownerDocumentScope");
const { uploadFile, deleteFile } = require("../../utils/storageService");
const { createWithSequence, PENDING_NUMBER } = require("../../utils/sequence");
const {
  createNotification,
  resolveNotificationsForEntity,
} = require("../../services/notificationService");
const {
  notifyOwnerRequestReviewers,
} = require("../../services/ownerRequestNotifier");

const STATUS_VALUES = ["open", "closed"];
const TYPE_VALUES = ["workOrder", "serviceAgreement"];
const HIDDEN_STAGES = ["Declined"]; // vendor-side state, shown to owners as "Open"
const NO_MATCH = [{ $match: { _id: null } }];
const MAX_DESCRIPTION = 2000;
const MAX_CANCEL_REASON = 500;
const REVIEW_ACTIONS = ["approve", "reject"];
const DETAIL_KINDS = {
  "work-order": "WorkOrder",
  "service-agreement": "ServiceAgreement",
};

// Only what an owner may see — never lock codes, invoices, vendor responses…
const COMMON_FIELDS = {
  status: 1,
  createdAt: 1,
  description: 1,
  closingComments: 1,
  building: 1,
  vendor: 1,
  assignedCompany: 1,
  category: 1,
  createdBy: 1,
};

// Same populate for the list and the details popup
const OWNER_POPULATE = [
  { path: "building", select: "formData.address unitNumber" },
  { path: "dynamicStatus", select: "name" },
  {
    path: "vendor",
    select: "technicianName companyName company",
    populate: { path: "company", select: "companyName" },
  },
  { path: "assignedCompany", select: "companyName" },
];

const WO_DETAIL_FIELDS =
  "workOrderNumber category building description status dynamicStatus vendor " +
  "assignedCompany dueDate completeDate closingComments createdAt createdBy " +
  "source reviewStatus assignmentType cancelledAt fileUrl";
const SA_DETAIL_FIELDS =
  "serviceAgreementNumber category building description status vendor " +
  "assignedCompany startDate endDate recurringSchedule closedAt closingComments createdAt";

const addressLabel = (b) =>
  [
    b?.formData?.address || "Address not set",
    b?.unitNumber ? `Unit ${b.unitNumber}` : null,
  ]
    .filter(Boolean)
    .join(" - ");

const vendorLabel = (r) =>
  r.vendor?.company?.companyName ||
  r.vendor?.companyName ||
  r.vendor?.technicianName ||
  r.assignedCompany?.companyName ||
  "";

// One place for the owner-facing status text (list + details)
const toOwnerStatusLabel = (r) => {
  if (r.cancelledAt) return "Cancelled";
  if (r.reviewStatus === "pending_review") return "Pending Approval";
  if (r.reviewStatus === "rejected") return "Not Approved";
  if (r.status === "closed") return "Closed";
  const stage = r.dynamicStatus?.name;
  return stage && !HIDDEN_STAGES.includes(stage) ? stage : "Open";
};

/* ───────────── Owner action rules (single source of truth) ─────────────
 * Edit:   own request, still open and still waiting for approval.
 * Cancel: own request, still open, and no vendor arranged yet
 *         (pending approval, or approved but not assigned).
 * The DB filters below enforce the same rules atomically on write. */
const ownerBase = (id, ownerId) => ({
  _id: id,
  createdBy: ownerId,
  source: "owner",
  status: "open",
});

const editableFilter = (id, ownerId) => ({
  ...ownerBase(id, ownerId),
  reviewStatus: "pending_review",
});

const ownerActions = (r, ownerId) => {
  const ownOpen =
    r.entityType !== "ServiceAgreement" &&
    r.source === "owner" &&
    String(r.createdBy?._id || r.createdBy) === String(ownerId) &&
    r.status === "open" &&
    !r.cancelledAt;

  const notArranged =
    r.reviewStatus === "approved" &&
    !r.vendor &&
    r.assignmentType === "unassigned";

  return {
    canEdit: ownOpen && r.reviewStatus === "pending_review",
    canCancel: ownOpen && (r.reviewStatus === "pending_review" || notArranged),
  };
};

// Explains WHY an edit/cancel was refused (only runs on the failure path)
const sendActionDenied = async (res, id, ownerId, action) => {
  const wo = await WorkOrder.findById(id)
    .select(
      "createdBy source status reviewStatus cancelledAt vendor assignmentType",
    )
    .lean();

  // Not theirs → behave as if it doesn't exist (no information leak)
  if (
    !wo ||
    wo.source !== "owner" ||
    String(wo.createdBy) !== String(ownerId)
  ) {
    return sendError(res, "Request not found", 404);
  }
  if (wo.cancelledAt)
    return sendError(res, "This request is already cancelled", 409);
  if (wo.status === "closed")
    return sendError(res, "This request is already closed", 409);

  return action === "edit"
    ? sendError(
        res,
        "Our team has already reviewed this request, so it can't be edited. Please contact us for changes.",
        409,
      )
    : sendError(
        res,
        "A vendor is already arranged for this request. Please contact us to cancel it.",
        409,
      );
};

const discardUpload = (req) => {
  if (req.file?.path) fs.unlink(req.file.path, () => {});
};

// Adjust the filter if your repairCategories model marks type differently
const getWorkOrderCategories = () =>
  Category.find({ type: "workOrder" }).select("name").sort({ name: 1 }).lean();

// Shared create/edit validation for the editable fields
const readCategoryAndDescription = async (body) => {
  const category = String(body?.category || "");
  const description =
    typeof body?.description === "string" ? body.description.trim() : "";

  if (!mongoose.isValidObjectId(category))
    return { error: "Please select a category" };
  if (!description) return { error: "Please describe the issue" };
  if (description.length > MAX_DESCRIPTION) {
    return {
      error: `Description must be ${MAX_DESCRIPTION} characters or fewer`,
    };
  }
  const exists = await Category.exists({ _id: category, type: "workOrder" });
  if (!exists) return { error: "Please select a valid category" };

  return { category, description };
};

// ========================= Owner: list =========================
// Combined Work Orders + Service Agreements for their portfolios' buildings
exports.getOwnerRepairs = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      100,
    );
    const { portfolioId, buildingId, status, type } = req.query;

    if (status && !STATUS_VALUES.includes(status)) {
      return sendError(res, "Invalid status filter", 400);
    }
    if (type && !TYPE_VALUES.includes(type)) {
      return sendError(res, "Invalid type filter", 400);
    }

    const { portfolios, portfolioIds, buildings } = await getOwnerDocumentScope(
      req.user._id,
    );

    const portfolioOptions = portfolios
      .map((p) => ({
        _id: p._id,
        label: p.portfolioName || p.portfolioAbbreviation || "Portfolio",
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const addressOptions = buildings
      .map((b) => ({
        _id: b._id,
        label: addressLabel(b),
        portfolioId: b.ownerPortfolioId,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    if (!portfolioIds.length) {
      return sendSuccess(res, "Repairs fetched successfully", {
        items: [],
        total: 0,
        page,
        pages: 0,
        portfolios: [],
        buildings: [],
      });
    }

    // Filters can only NARROW the owner's buildings, never widen them
    let scoped = buildings;
    if (portfolioId && portfolioId !== "All") {
      scoped = scoped.filter(
        (b) => String(b.ownerPortfolioId) === String(portfolioId),
      );
    }
    if (buildingId && buildingId !== "All") {
      scoped = scoped.filter(
        (b) =>
          String(b._id) === String(buildingId) ||
          String(b.parentBuilding) === String(buildingId),
      );
    }

    const match = { building: { $in: scoped.map((b) => b._id) } };
    if (status) match.status = status; // no status = All

    const woBranch =
      type === "serviceAgreement"
        ? NO_MATCH
        : [
            { $match: match },
            {
              $project: {
                ...COMMON_FIELDS,
                dynamicStatus: 1,
                reviewStatus: 1,
                source: 1,
                assignmentType: 1,
                cancelledAt: 1,
                number: "$workOrderNumber",
                entityType: { $literal: "WorkOrder" },
              },
            },
          ];

    const saBranch =
      type === "workOrder"
        ? NO_MATCH
        : [
            { $match: match },
            {
              $project: {
                ...COMMON_FIELDS,
                startDate: 1,
                endDate: 1,
                recurringSchedule: 1,
                number: "$serviceAgreementNumber",
                entityType: { $literal: "ServiceAgreement" },
              },
            },
          ];

    const [result] = await WorkOrder.aggregate([
      ...woBranch,
      {
        $unionWith: {
          coll: ServiceAgreement.collection.name,
          pipeline: saBranch,
        },
      },
      { $sort: { createdAt: -1, _id: -1 } }, // _id = stable paging
      {
        $facet: {
          data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          total: [{ $count: "count" }],
        },
      },
    ]);

    const rows = result?.data || [];
    const total = result?.total?.[0]?.count || 0;

    await WorkOrder.populate(rows, OWNER_POPULATE);

    // category is stored as an id OR a plain name — resolve ids in one query
    const catIds = [
      ...new Set(
        rows
          .map((r) => r.category)
          .filter((c) => c && mongoose.isValidObjectId(c)),
      ),
    ];
    const cats = catIds.length
      ? await Category.find({ _id: { $in: catIds } })
          .select("name")
          .lean()
      : [];
    const catName = new Map(cats.map((c) => [String(c._id), c.name]));

    const portfolioOf = new Map(
      buildings.map((b) => [String(b._id), b.ownerPortfolioId]),
    );
    const ownerId = String(req.user._id);

    const items = rows.map((r) => ({
      _id: r._id,
      entityType: r.entityType,
      number: r.number,
      status: r.status,
      statusLabel: toOwnerStatusLabel(r),
      createdAt: r.createdAt,
      description: r.description || "",
      closingComments: r.status === "closed" ? r.closingComments || "" : "",
      category:
        catName.get(String(r.category)) ||
        (mongoose.isValidObjectId(r.category) ? "" : r.category || ""),
      buildingId: r.building?._id || null,
      address: r.building ? addressLabel(r.building) : "",
      portfolioId: portfolioOf.get(String(r.building?._id)) || null,
      assignedVendor: vendorLabel(r),
      isMine: String(r.createdBy) === ownerId,
      ...ownerActions(r, ownerId),
      ...(r.entityType === "ServiceAgreement" && {
        startDate: r.startDate,
        endDate: r.endDate,
        recurringSchedule: r.recurringSchedule || null,
      }),
    }));

    return sendSuccess(res, "Repairs fetched successfully", {
      items,
      total,
      page,
      pages: Math.ceil(total / limit),
      portfolios: portfolioOptions,
      buildings: addressOptions,
    });
  } catch (err) {
    console.error("Error fetching owner repairs:", err);
    return sendError(res, "Failed to fetch repairs", 500);
  }
};

// ========================= Owner: view details =========================
// GET /owner/repairs/:kind/:id   kind = work-order | service-agreement
exports.getOwnerRepairDetails = async (req, res) => {
  try {
    const { kind, id } = req.params;
    const entityType = DETAIL_KINDS[kind];
    if (!entityType) return sendError(res, "Invalid repair type", 400);
    if (!mongoose.isValidObjectId(id))
      return sendError(res, "Invalid repair id", 400);

    const isWO = entityType === "WorkOrder";
    const Model = isWO ? WorkOrder : ServiceAgreement;

    // Scope check is part of the query: other owners' records simply don't exist
    const { buildingIds } = await getOwnerDocumentScope(req.user._id);
    const doc = await Model.findOne({ _id: id, building: { $in: buildingIds } })
      .select(isWO ? WO_DETAIL_FIELDS : SA_DETAIL_FIELDS)
      .lean();
    if (!doc) return sendError(res, "Repair not found", 404);

    await WorkOrder.populate(doc, OWNER_POPULATE);

    let category = mongoose.isValidObjectId(doc.category) ? "" : doc.category;
    if (!category && doc.category) {
      const cat = await Category.findById(doc.category).select("name").lean();
      category = cat?.name || "";
    }

    const row = { ...doc, entityType };

    return sendSuccess(res, "Repair fetched successfully", {
      repair: {
        _id: doc._id,
        entityType,
        typeLabel: isWO ? "Work Order" : "Service Agreement",
        number: isWO ? doc.workOrderNumber : doc.serviceAgreementNumber,
        category: category || "—",
        categoryId: mongoose.isValidObjectId(doc.category)
          ? String(doc.category)
          : null,
        buildingId: doc.building?._id || null,
        address: doc.building ? addressLabel(doc.building) : "—",
        assignedVendor: vendorLabel(doc) || "Not assigned yet",
        description: doc.description || "",
        status: doc.status,
        statusLabel: toOwnerStatusLabel(row),
        createdAt: doc.createdAt,
        completedAt: isWO ? doc.completeDate : doc.closedAt,
        closingComments:
          doc.status === "closed" ? doc.closingComments || "" : "",
        ...(isWO
          ? { dueDate: doc.dueDate || null, hasAttachment: !!doc.fileUrl }
          : {
              startDate: doc.startDate || null,
              endDate: doc.endDate || null,
              recurringSchedule: doc.recurringSchedule || null,
            }),
        ...ownerActions(row, req.user._id),
      },
    });
  } catch (err) {
    console.error("Error fetching owner repair details:", err);
    return sendError(res, "Failed to load the repair", 500);
  }
};

// ========================= Owner: create request =========================
// Owner: dropdown data for the Create Request form (own addresses only)
exports.getOwnerRepairFormOptions = async (req, res) => {
  try {
    const [{ buildings }, categories] = await Promise.all([
      getOwnerDocumentScope(req.user._id),
      getWorkOrderCategories(),
    ]);

    return sendSuccess(res, "Form options fetched", {
      buildings: buildings
        .map((b) => ({
          _id: b._id,
          label: addressLabel(b),
          portfolioId: b.ownerPortfolioId,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      categories,
    });
  } catch (err) {
    console.error("Error fetching owner repair form options:", err);
    return sendError(res, "Failed to load the request form", 500);
  }
};

// Owner: create a Work Order that waits for Internal Team approval
exports.createOwnerWorkOrder = async (req, res) => {
  try {
    const building = String(req.body?.building || "");
    if (!mongoose.isValidObjectId(building)) {
      discardUpload(req);
      return sendError(res, "Please select an address", 400);
    }

    const input = await readCategoryAndDescription(req.body);
    if (input.error) {
      discardUpload(req);
      return sendError(res, input.error, 400);
    }

    // Owners can only raise requests for their own properties
    const { buildingIds } = await getOwnerDocumentScope(req.user._id);
    if (!buildingIds.some((id) => String(id) === building)) {
      discardUpload(req);
      return sendError(
        res,
        "You can only create requests for your own properties",
        403,
      );
    }

    const defaultStatus = await WODynamicStatus.findOne({ isDefault: true })
      .select("_id")
      .lean();
    if (!defaultStatus) {
      discardUpload(req);
      return sendError(res, "Repair requests are temporarily unavailable", 503);
    }

    // Server decides everything else — never trusted from the owner
    const workOrder = await createWithSequence(
      WorkOrder,
      {
        workOrderNumber: PENDING_NUMBER,
        workOrderType: "serviceRequest",
        category: input.category,
        building,
        description: input.description,
        assignmentType: "unassigned", // no vendor is notified
        vendor: null,
        status: "open",
        dynamicStatus: defaultStatus._id,
        source: "owner",
        reviewStatus: "pending_review",
        createdBy: req.user._id,
      },
      {
        sequenceName: "workOrder",
        assignNumber: (doc, seq) => {
          doc.workOrderNumber = `WO #${String(seq).padStart(4, "0")}`;
        },
        // Upload only once the request is known to be valid
        afterValidate: async (doc) => {
          if (req.file)
            doc.fileUrl = await uploadFile(
              req.file,
              "uploads/Repair/workOrders",
            );
        },
      },
    );

    // Alert the Internal Team of the team that manages this building
    notifyOwnerRequestReviewers(workOrder).catch((e) =>
      console.error("Owner request notification failed:", e),
    );

    return sendSuccess(
      res,
      `Request ${workOrder.workOrderNumber} submitted. Our team will review it shortly.`,
      {
        workOrder: {
          _id: workOrder._id,
          number: workOrder.workOrderNumber,
          reviewStatus: workOrder.reviewStatus,
        },
      },
      201,
    );
  } catch (err) {
    discardUpload(req);
    if (err.name === "ValidationError") {
      return sendError(
        res,
        Object.values(err.errors)[0]?.message || "Invalid request",
        400,
      );
    }
    console.error("Error creating owner work order:", err);
    return sendError(res, "Failed to submit your request", 500);
  }
};

// ========================= Owner: edit own request =========================
// PATCH /owner/work-orders/:id   (category, description, optional new file)
// The address is fixed: a different property is a different request.
exports.updateOwnerWorkOrder = async (req, res) => {
  let newFileUrl = null;
  try {
    const { id } = req.params;
    const ownerId = req.user._id;

    if (!mongoose.isValidObjectId(id)) {
      discardUpload(req);
      return sendError(res, "Invalid request id", 400);
    }

    const input = await readCategoryAndDescription(req.body);
    if (input.error) {
      discardUpload(req);
      return sendError(res, input.error, 400);
    }

    // Cheap pre-check so we never upload a file for a request that can't change
    const current = await WorkOrder.findOne(editableFilter(id, ownerId))
      .select("fileUrl")
      .lean();
    if (!current) {
      discardUpload(req);
      return sendActionDenied(res, id, ownerId, "edit");
    }

    if (req.file) {
      newFileUrl = await uploadFile(req.file, "uploads/Repair/workOrders");
    }

    const $set = { category: input.category, description: input.description };
    if (newFileUrl) $set.fileUrl = newFileUrl;

    // Atomic: fails if the team approved/rejected it in the meantime
    const updated = await WorkOrder.findOneAndUpdate(
      editableFilter(id, ownerId),
      { $set },
      { new: true, runValidators: true },
    )
      .select("workOrderNumber reviewStatus")
      .lean();

    if (!updated) {
      if (newFileUrl) deleteFile(newFileUrl).catch(() => {});
      return sendActionDenied(res, id, ownerId, "edit");
    }

    // Replace succeeded → old file is no longer referenced
    if (newFileUrl && current.fileUrl) {
      deleteFile(current.fileUrl).catch((e) =>
        console.error("Old owner request file cleanup failed:", e),
      );
    }

    return sendSuccess(res, `${updated.workOrderNumber} updated`, {
      workOrder: {
        _id: updated._id,
        number: updated.workOrderNumber,
        reviewStatus: updated.reviewStatus,
      },
    });
  } catch (err) {
    discardUpload(req);
    if (newFileUrl) deleteFile(newFileUrl).catch(() => {});
    if (err.name === "ValidationError") {
      return sendError(
        res,
        Object.values(err.errors)[0]?.message || "Invalid request",
        400,
      );
    }
    console.error("Error updating owner work order:", err);
    return sendError(res, "Failed to update your request", 500);
  }
};

// ========================= Owner: cancel own request =========================
// PATCH /owner/work-orders/:id/cancel   { reason? }
exports.cancelOwnerWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user._id;
    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

    if (!mongoose.isValidObjectId(id))
      return sendError(res, "Invalid request id", 400);
    if (reason.length > MAX_CANCEL_REASON) {
      return sendError(
        res,
        `Reason must be ${MAX_CANCEL_REASON} characters or fewer`,
        400,
      );
    }

    const fields = {
      status: "closed",
      closingComments: reason
        ? `Cancelled by owner: ${reason}`
        : "Cancelled by owner",
      cancelledAt: new Date(),
      cancelledBy: ownerId,
      cancelReason: reason || null,
    };
    const SELECT = "workOrderNumber reviewStatus reviewedBy";

    // 1) Still waiting for approval → also mark the review as cancelled
    let wo = await WorkOrder.findOneAndUpdate(
      { ...ownerBase(id, ownerId), reviewStatus: "pending_review" },
      { $set: { ...fields, reviewStatus: "cancelled" } },
      { new: true },
    )
      .select(SELECT)
      .lean();

    // 2) Approved but no vendor arranged yet → keep the approval history
    if (!wo) {
      wo = await WorkOrder.findOneAndUpdate(
        {
          ...ownerBase(id, ownerId),
          reviewStatus: "approved",
          vendor: null,
          assignmentType: "unassigned",
        },
        { $set: fields },
        { new: true },
      )
        .select(SELECT)
        .lean();
    }

    if (!wo) return sendActionDenied(res, id, ownerId, "cancel");

    // Approvers no longer need to act on it
    resolveNotificationsForEntity(wo._id, ["OWNER_REQUEST_SUBMITTED"]).catch(
      (e) => console.error("Resolve owner request notifications failed:", e),
    );

    // Already approved → tell the approver so nobody arranges a vendor
    if (wo.reviewStatus === "approved" && wo.reviewedBy) {
      User.findById(wo.reviewedBy)
        .select("role")
        .lean()
        .then((reviewer) =>
          reviewer
            ? createNotification({
                user: reviewer._id,
                role: reviewer.role,
                type: "OWNER_REQUEST_CANCELLED",
                title: "Owner Cancelled a Request",
                message: `The owner cancelled ${wo.workOrderNumber}. No vendor is needed.${
                  reason ? ` Reason: ${reason}` : ""
                }`,
                entityType: "WorkOrder",
                entityId: wo._id,
              })
            : null,
        )
        .catch((e) => console.error("Owner cancel notification failed:", e));
    }

    return sendSuccess(res, `${wo.workOrderNumber} cancelled`, {
      workOrder: { _id: wo._id, number: wo.workOrderNumber },
    });
  } catch (err) {
    console.error("Error cancelling owner work order:", err);
    return sendError(res, "Failed to cancel your request", 500);
  }
};

// ========================= Internal Team: review =========================
// Approve or reject an owner request
exports.reviewOwnerRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const action = req.body?.action;
    const notes =
      typeof req.body?.notes === "string"
        ? req.body.notes.trim().slice(0, 1000)
        : "";

    if (!mongoose.isValidObjectId(id))
      return sendError(res, "Invalid work order id", 400);
    if (!REVIEW_ACTIONS.includes(action))
      return sendError(res, "Action must be approve or reject", 400);
    if (action === "reject" && !notes) {
      return sendError(res, "Please give a reason so the owner knows why", 400);
    }

    const now = new Date();
    const update =
      action === "approve"
        ? {
            $set: {
              reviewStatus: "approved",
              reviewedBy: req.user._id,
              reviewedAt: now,
            },
          }
        : {
            // findOneAndUpdate skips the "closed needs invoice" save hook on purpose:
            // a rejected request never had any work or invoice.
            $set: {
              reviewStatus: "rejected",
              reviewedBy: req.user._id,
              reviewedAt: now,
              reviewNotes: notes,
              status: "closed",
              closingComments: notes,
            },
          };

    // Atomic: only a request still awaiting approval can change
    const wo = await WorkOrder.findOneAndUpdate(
      { _id: id, reviewStatus: "pending_review" },
      update,
      { new: true },
    )
      .select("workOrderNumber reviewStatus status createdBy")
      .lean();

    if (!wo) {
      const current = await WorkOrder.findById(id)
        .select("reviewStatus")
        .lean();
      if (!current) return sendError(res, "Work order not found", 404);
      return sendError(
        res,
        current.reviewStatus === "cancelled"
          ? "The owner has cancelled this request"
          : "This request has already been reviewed",
        409,
      );
    }

    // Clear the "needs approval" alert for EVERY approver (popup or table, same result)
    resolveNotificationsForEntity(wo._id, ["OWNER_REQUEST_SUBMITTED"]).catch(
      (e) => console.error("Resolve owner request notifications failed:", e),
    );

    createNotification({
      user: wo.createdBy,
      role: "Owner",
      type: "OWNER_REQUEST_REVIEWED",
      title:
        action === "approve"
          ? "Repair Request Approved"
          : "Repair Request Not Approved",
      message:
        action === "approve"
          ? `${wo.workOrderNumber} was approved and is being arranged.`
          : `${wo.workOrderNumber} was not approved. Reason: ${notes}`,
      entityType: "WorkOrder",
      entityId: wo._id,
    }).catch((e) => console.error("Owner review notification failed:", e));

    return sendSuccess(
      res,
      action === "approve" ? "Request approved" : "Request rejected",
      { workOrder: wo },
    );
  } catch (err) {
    console.error("Error reviewing owner request:", err);
    return sendError(res, "Failed to review the request", 500);
  }
};
