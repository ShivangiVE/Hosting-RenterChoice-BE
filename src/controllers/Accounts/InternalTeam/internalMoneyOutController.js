const Invoice = require("../../../models/Accounts/Invoice");
const Category = require("../../../models/repairCategories");
const { sendSuccess, sendError } = require("../../../utils/response");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 100;

const ALLOWED_SORT_FIELDS = {
  amount: "confirmedData.amount",
  confirmedAt: "confirmedAt",
};

const getAddress = (building) => {
  if (!building) return "—";

  return (
    building.formData?.fullAddress ||
    building.formData?.address ||
    building.buildingAbbreviation ||
    "—"
  );
};

exports.getInternalTeamMoneyOut = async (req, res) => {
  try {
    const page = Math.max(
      Number.parseInt(req.query.page, 10) || DEFAULT_PAGE,
      1,
    );

    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    const skip = (page - 1) * limit;

    const sortField = ALLOWED_SORT_FIELDS[req.query.sortBy] || "confirmedAt";

    const sortDirection = req.query.sortOrder === "asc" ? 1 : -1;

    const filter = {
      status: "confirmed",
    };

    // 1. Fetch invoices and total count
    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .select(
          [
            "workOrder",
            "confirmedData",
            "confirmedAt",
            "fileUrl",
            "originalFileName",
            "mimeType",
            "billNumber",
            "extractedData.currency",
          ].join(" "),
        )
        .populate({
          path: "workOrder",
          select: "workOrderNumber workOrderType category description building",
          populate: {
            path: "building",
            select:
              "buildingAbbreviation formData.address formData.fullAddress",
          },
        })
        .sort({
          [sortField]: sortDirection,
          _id: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      Invoice.countDocuments(filter),
    ]);

    // 2. Collect unique category IDs from fetched work orders
    const categoryIds = [
      ...new Set(
        invoices
          .map((invoice) => invoice.workOrder?.category)
          .filter(Boolean)
          .map(String),
      ),
    ];

    // 3. Fetch all required categories in ONE query
    const categories = await Category.find({
      _id: { $in: categoryIds },
    })
      .select("name")
      .lean();

    // 4. Create fast lookup map:
    // categoryId -> categoryName
    const categoryMap = new Map(
      categories.map((category) => [category._id.toString(), category.name]),
    );

    // 5. Build frontend-ready records
    const records = invoices
      .filter((invoice) => invoice.workOrder)
      .map((invoice) => {
        const workOrder = invoice.workOrder;

        return {
          _id: invoice._id,
          workOrderId: workOrder._id,
          workOrderNumber: workOrder.workOrderNumber || "—",
          type: workOrder.workOrderType || "—",
          workOrderDescription: workOrder.description || "—",
          address: getAddress(workOrder.building),
          category:
            categoryMap.get(String(workOrder.category)) ||
            workOrder.category ||
            "—",
          type: workOrder.workOrderType || "—",
          comments: invoice.confirmedData?.comments || "",
          amount: invoice.confirmedData?.amount ?? null,
          currency: invoice.extractedData?.currency || "CAD",
          invoiceNumber: invoice.confirmedData?.invoiceNumber || "—",
          confirmedAt: invoice.confirmedAt,
          fileUrl: invoice.fileUrl,
          originalFileName: invoice.originalFileName,
          mimeType: invoice.mimeType,
          billNumber: invoice.billNumber || null,
        };
      });

    return sendSuccess(
      res,
      "Internal team money-out records fetched successfully",
      {
        records,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total,
          limit,
        },
      },
    );
  } catch (err) {
    console.error("Get internal team money-out error:", err);

    return sendError(
      res,
      err.message || "Failed to fetch internal team money-out records",
      500,
    );
  }
};
