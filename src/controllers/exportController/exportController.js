const { generateExport } = require("../../services/exportService");
const { sendError } = require("../../utils/response");
const Building = require("../../models/Building");
const Portfolio = require("../../models/Portfolio");
const Category = require("../../models/repairCategories");

/**
 * Helper to fetch buildings & portfolios (for resolving tags)
 */
const fetchBuildingsAndPortfolios = async () => {
  const [buildings, portfolios, categories] = await Promise.all([
    Building.find().select("_id name formData"),
    Portfolio.find().select("_id name portfolioAbbreviation formData"),
    Category.find().select("_id name"),
  ]);
  return { buildings, portfolios, categories };
};

exports.exportData = async (req, res) => {
  try {
    // Accept ids from GET ?ids=1,2,3 or POST body
    const idsInput = req.body.ids || req.query.ids;

    // Accept module from GET or POST
    const documentType = req.body.module || req.query.module;

    // Accept format
    const format = req.body.format || req.query.format || "pdf";

    // Preview mode (true = inline view)
    const preview =
      req.body.preview === true ||
      req.body.preview === "true" ||
      req.query.preview === "true";

    // ---- Validate Inputs ----
    if (!documentType) {
      return sendError(res, "module (documentType) is required", 400);
    }

    // Convert ids to array
    let ids = [];
    if (Array.isArray(idsInput)) {
      ids = idsInput;
    } else if (typeof idsInput === "string") {
      ids = idsInput.split(","); // "1,2,3"
    }

    if (!ids.length) {
      return sendError(res, "ids array required", 400);
    }

    const moduleMap = {
      task: require("../../models/tasks/Task"),
      todo: require("../../models/tasks/Todo"),
      note: require("../../models/Notes&Documents/Note"),
      workOrder: require("../../models/WorkOrder"),
      serviceAgreement: require("../../models/ServiceAgreement"),
      inspectionRequest: require("../../models/InspectionRequest"),
    };

    const Model = moduleMap[documentType];
    if (!Model) {
      return sendError(
        res,
        `Invalid module: ${documentType}. No model registered.`,
        400
      );
    }

    // ---- POPULATE RULES ----
    const populateMap = {
      task: [
        { path: "category", select: "name" },
        { path: "assignedTo", select: "preferredName email" },
        { path: "createdBy", select: "preferredName email" },
      ],
      todo: [
        { path: "category", select: "name" },
        { path: "assignedTo", select: "preferredName email" },
        { path: "createdBy", select: "preferredName email" },
      ],
      note: [
        { path: "category", select: "name" },
        { path: "createdBy", select: "preferredName email" },
      ],
      workOrder: [
        {
          path: "building",
          select: "formData address portfolio buildingAbbreviation",
          populate: {
            path: "portfolio",
            select: "portfolioAbbreviation formData.name",
          },
        },
        { path: "vendor", select: "companyName technicianName email" },
        { path: "dynamicStatus", select: "name description" },
        { path: "createdBy", select: "preferredName email" },
      ],
      serviceAgreement: [
        {
          path: "building",
          select: "formData address portfolio buildingAbbreviation",
          populate: {
            path: "portfolio",
            select: "portfolioAbbreviation formData.name",
          },
        },
        { path: "vendor", select: "companyName technicianName email" },
        { path: "category", select: "name" },
        { path: "createdBy", select: "preferredName email" },
      ],
      inspectionRequest: [
        {
          path: "building",
          select: "formData address portfolio buildingAbbreviation",
          populate: {
            path: "portfolio",
            select: "portfolioAbbreviation formData.name",
          },
        },
        { path: "assignedTo", select: "preferredName email" },
        { path: "createdBy", select: "preferredName email" },
      ],
    };

    // -------- Query Records --------
    let query = Model.find({ _id: { $in: ids } }).sort({ createdAt: -1 });

    if (populateMap[documentType]) {
      populateMap[documentType].forEach((p) => (query = query.populate(p)));
    }

    const items = await query;

    if (!items || items.length === 0) {
      return sendError(res, "No items found for provided ids", 404);
    }

    // Fetch related data
    const { buildings, portfolios, categories } =
      await fetchBuildingsAndPortfolios();

    // Generate PDF/Excel buffer
    const buffer = await generateExport({
      items,
      documentType,
      format,
      buildings,
      portfolios,
      categories,
    });

    // Final filename
    const ext = format === "pdf" ? "pdf" : "xlsx";
    const fileName = `${documentType}_export_${Date.now()}.${ext}`;

    // Headers
    res.setHeader(
      "Content-Type",
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `${preview ? "inline" : "attachment"}; filename="${fileName}"`
    );

    res.setHeader("X-Filename", fileName);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", buffer.length);

    return res.send(buffer);
  } catch (err) {
    console.error("Export error:", err);
    return sendError(res, err.message || "Failed to export", 500);
  }
};
