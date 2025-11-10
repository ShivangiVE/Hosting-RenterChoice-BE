const AuditService = require("../../services/auditService");
const { sendSuccess, sendError } = require("../../utils/response");

// Get audit summary with filters
exports.getAuditSummary = async (req, res) => {
  try {
    const {
      entityType,
      entityId,
      page = 1,
      limit = 10,
      startDate,
      endDate,
      action,
    } = req.query;

    const result = await AuditService.getAuditTrail({
      entityType,
      entityId,
      page: parseInt(page),
      limit: parseInt(limit),
      startDate,
      endDate,
      action,
    });

    return sendSuccess(res, "Audit summary fetched successfully", result);
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// Get audit for specific building
exports.getBuildingAudit = async (req, res) => {
  try {
    const { buildingId } = req.params;
    const { page = 1, limit = 10, startDate, endDate, action } = req.query;

    console.log(`Fetching audit for building: ${buildingId}`);

    const result = await AuditService.getAuditTrail({
      entityType: "building",
      entityId: buildingId,
      page: parseInt(page),
      limit: parseInt(limit),
      startDate,
      endDate,
      action,
    });

    return sendSuccess(res, "Building audit fetched successfully", result);
  } catch (err) {
    console.error("Error fetching building audit:", err);
    return sendError(res, err.message, 500);
  }
};

// Get audit for specific portfolio
exports.getPortfolioAudit = async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { page = 1, limit = 10, startDate, endDate, action } = req.query;

    console.log(`Fetching audit for portfolio: ${portfolioId}`);

    const result = await AuditService.getAuditTrail({
      entityType: "portfolio",
      entityId: portfolioId,
      page: parseInt(page),
      limit: parseInt(limit),
      startDate,
      endDate,
      action,
    });

    return sendSuccess(res, "Portfolio audit fetched successfully", result);
  } catch (err) {
    console.error("Error fetching portfolio audit:", err);
    return sendError(res, err.message, 500);
  }
};
