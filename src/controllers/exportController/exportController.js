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
    const {
      ids,
      module: documentType,
      format = "pdf",
      preview = false,
    } = req.body;

    if (!documentType)
      return sendError(res, "module (documentType) is required", 400);
    if (!ids || !Array.isArray(ids) || ids.length === 0)
      return sendError(res, "ids array required", 400);

    // Model map
    const moduleMap = {
      task: require("../../models/tasks/Task"),
      todo: require("../../models/tasks/Todo"),
      note: require("../../models/Notes&Documents/Note"),
      workOrder: require("../../models/WorkOrder"),
      serviceAgreement: require("../../models/ServiceAgreement"),
      inspectionRequest: require("../../models/InspectionRequest"),
    };

    // Populate rules map
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

    // Select Model
    const Model = moduleMap[documentType];
    if (!Model)
      return sendError(
        res,
        `No model registered for module: ${documentType}`,
        400
      );

    let query = Model.find({ _id: { $in: ids } }).sort({ createdAt: -1 });

    if (populateMap[documentType]) {
      populateMap[documentType].forEach((pop) => {
        query = query.populate(pop);
      });
    }

    const items = await query;

    if (!items || items.length === 0)
      return sendError(res, "No items found for provided ids", 404);

    const { buildings, portfolios, categories } =
      await fetchBuildingsAndPortfolios();

    const buffer = await generateExport({
      items,
      documentType,
      format,
      buildings,
      portfolios,
      categories,
    });

    const ext = format === "pdf" ? "pdf" : "xlsx";
    const fileName = `${documentType}_export_${Date.now()}.${ext}`;

    res.setHeader(
      "Content-Type",
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    const dispositionType = preview ? "inline" : "attachment";
    res.setHeader(
      "Content-Disposition",
      `${dispositionType}; filename="${fileName}"`
    );
    res.setHeader("Content-Length", buffer.length);

    return res.send(buffer);
  } catch (err) {
    console.error("Export error:", err);
    return sendError(res, err.message || "Failed to export", 500);
  }
};
