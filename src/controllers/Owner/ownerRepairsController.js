const mongoose = require("mongoose");
const WorkOrder = require("../../models/WorkOrder");
const ServiceAgreement = require("../../models/ServiceAgreement");
const Category = require("../../models/repairCategories");
const { sendSuccess, sendError } = require("../../utils/response");
const { getOwnerDocumentScope } = require("../../utils/ownerDocumentScope");

const STATUS_VALUES = ["open", "closed"];
const TYPE_VALUES = ["workOrder", "serviceAgreement"];
const HIDDEN_STAGES = ["Declined"]; // vendor-side state, shown to owners as "Open"
const NO_MATCH = [{ $match: { _id: null } }];

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

const addressLabel = (b) =>
  [
    b?.formData?.address || "Address not set",
    b?.unitNumber ? `Unit ${b.unitNumber}` : null,
  ]
    .filter(Boolean)
    .join(" - ");

// Owner: combined Work Orders + Service Agreements for their portfolios' buildings
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

    await WorkOrder.populate(rows, [
      { path: "building", select: "formData.address unitNumber" },
      { path: "dynamicStatus", select: "name" },
      {
        path: "vendor",
        select: "technicianName companyName company",
        populate: { path: "company", select: "companyName" },
      },
      { path: "assignedCompany", select: "companyName" },
    ]);

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

    const items = rows.map((r) => {
      const stage = r.dynamicStatus?.name;
      const statusLabel =
        r.status === "closed"
          ? "Closed"
          : stage && !HIDDEN_STAGES.includes(stage)
            ? stage
            : "Open";

      return {
        _id: r._id,
        entityType: r.entityType,
        number: r.number,
        status: r.status,
        statusLabel,
        createdAt: r.createdAt,
        description: r.description || "",
        closingComments: r.status === "closed" ? r.closingComments || "" : "",
        category:
          catName.get(String(r.category)) ||
          (mongoose.isValidObjectId(r.category) ? "" : r.category || ""),
        buildingId: r.building?._id || null,
        address: r.building ? addressLabel(r.building) : "",
        portfolioId: portfolioOf.get(String(r.building?._id)) || null,
        assignedVendor:
          r.vendor?.company?.companyName ||
          r.vendor?.companyName ||
          r.vendor?.technicianName ||
          r.assignedCompany?.companyName ||
          "",
        isMine: String(r.createdBy) === ownerId, // for "owners can only cancel their own"
        ...(r.entityType === "ServiceAgreement" && {
          startDate: r.startDate,
          endDate: r.endDate,
          recurringSchedule: r.recurringSchedule || null,
        }),
      };
    });

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
