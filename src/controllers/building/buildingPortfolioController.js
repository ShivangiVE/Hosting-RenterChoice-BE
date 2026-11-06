const mongoose = require("mongoose");
const Building = require("../../models/Building");
const FormTemplate = require("../../models/FormTemplate");
const Portfolio = require("../../models/Portfolio");
const User = require("../../models/User");
const WorkOrder = require("../../models/WorkOrder");
const WODynamicStatus = require("../../models/WODynamicStatus");
const AuditService = require("../../services/auditService");
const { generateAccountNumber } = require("../../utils/generateAccountNumber");
const {
  invalidateSessionsForOwnersWithNoActivePortfolio,
} = require("../../utils/portfolioAccess/invalidateOwnerSessions");
const resolveTeamUserIds = require("../../utils/resolveTeamUserIds");
const {
  notifyOwnersAttachedToPortfolio,
  sendOwnerInvite,
} = require("../../services/ownerInviteService");

// Fire-and-forget: an email problem must never fail a committed save
const notifyAttachedOwners = (portfolioId, ownerIds) => {
  if (!ownerIds?.length) return;
  notifyOwnersAttachedToPortfolio({ portfolioId, ownerIds }).catch((e) =>
    console.error("Owner attach notification failed:", e),
  );
};
const { sendSuccess, sendError } = require("../../utils/response");

const validateAgainstTemplate = (template, formData) => {
  const errors = [];

  template.fields.forEach((field) => {
    const val = formData[field.name];

    // required check
    const isEmpty = (v) =>
      v === undefined ||
      v === null ||
      (typeof v === "string" && v.trim() === "") ||
      (Array.isArray(v) && v.length === 0);

    if (field.required && isEmpty(val)) {
      errors.push(`"${field.label}" is required`);
      return;
    }

    // skip further checks if empty
    if (isEmpty(val)) return;

    switch (field.type) {
      case "number":
        if (isNaN(Number(val)))
          errors.push(`"${field.label}" must be a number`);
        break;
      case "email":
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val)))
          errors.push(`"${field.label}" must be a valid email`);
        break;
      case "select":
      case "radio":
        if (!field.options.includes(val))
          errors.push(`"${field.label}" has an invalid selection`);
        break;
      case "checkbox":
        // If options present -> expect array of selected options
        if (field.options && field.options.length > 0) {
          if (!Array.isArray(val)) {
            errors.push(`"${field.label}" should be an array`);
          } else {
            const invalid = val.filter((v) => !field.options.includes(v));
            if (invalid.length)
              errors.push(`"${field.label}" contains invalid options`);
          }
        } else {
          // if no options, expect boolean
          if (typeof val !== "boolean")
            errors.push(`"${field.label}" must be true/false`);
        }
        break;
      // file handled client-side (upload to /api/uploads first) -> stored URL string
      default:
        break;
    }
  });

  return errors;
};

exports.validateAgainstTemplate = validateAgainstTemplate;

const ALLOWED_PORTFOLIO_STATUSES = ["Active", "Deactivated"];

async function findActivePortfolioOrError(portfolioId) {
  const portfolio = await Portfolio.findById(portfolioId).select("status");
  if (!portfolio) return { error: "Selected portfolio not found", status: 404 };
  if (portfolio.status === "Deactivated") {
    return {
      error:
        "Cannot attach a building to a deactivated portfolio. Reactivate the portfolio first.",
      status: 400,
    };
  }
  return { error: null };
}

const normalizeBoolean = (val) => {
  if (typeof val === "boolean") return val;
  if (typeof val === "string")
    return ["yes", "true"].includes(val.trim().toLowerCase());
  return false;
};

async function saveSubmission(formType, formData, userId) {
  if (formType === "building") {
    const { buildingAbbreviation, portfolio, isMultiUnit, ...restData } =
      formData;

    const defaultFields = {
      address: "",
      fullAddress: "",
      buildingType: "",
      unitType: "",
      buildingName: "",
      floorNumber: "",
      totalFloors: "",
      isCondo: false,
      bedrooms: 0,
      bathrooms: 0,
      monthlyRent: 0,
      securityDeposit: 0,
      utilities: "",
      reasonPropertyLost: "",
      tenancyName: "",
    };

    return Building.create({
      buildingAbbreviation,
      portfolio,
      isMultiUnit: normalizeBoolean(isMultiUnit),
      formData: { ...defaultFields, ...restData },
      status: formData.status || "vacant",
      createdBy: userId,
    });
  }
  if (formType === "portfolio") {
    const { portfolioAbbreviation, portfolioName, ownerIds, ...restData } =
      formData;
    return Portfolio.create({
      portfolioName,
      portfolioAbbreviation,
      formData: restData,
      createdBy: userId,
    });
  }
  throw new Error("Unsupported form type");
}

const DECIMAL_2 = /^(\d+\.?\d{0,2}|\.\d{1,2})$/;

const BUILDING_NUMERIC_RULES = {
  totalFloors: { pattern: /^\d+$/, label: "Total Floors" },
  monthlyRent: { pattern: DECIMAL_2, label: "Monthly Rent" },
  securityDeposit: { pattern: DECIMAL_2, label: "Security Deposit" },
};

const validateBuildingNumbers = (data) =>
  Object.entries(BUILDING_NUMERIC_RULES)
    .filter(
      ([key]) =>
        data[key] !== undefined && data[key] !== null && data[key] !== "",
    )
    .filter(([key, rule]) => !rule.pattern.test(String(data[key]).trim()))
    .map(([, rule]) => `"${rule.label}" must be a valid number`);

// ========================= Buildings =========================
// create buildings
exports.createBuilding = async (req, res) => {
  try {
    const template = await FormTemplate.findOne({
      formType: "building",
      isActive: true,
    });
    if (!template)
      return sendError(res, "Building form template not found", 404);

    const formData = req.body;

    if (formData.portfolio) {
      const check = await findActivePortfolioOrError(formData.portfolio);
      if (check.error) return sendError(res, check.error, check.status);
    }

    // CONDITIONAL VALIDATION: Only require buildingAbbreviation for multi_family
    if (
      formData.buildingType === "multi_family" &&
      !formData.buildingAbbreviation
    ) {
      return sendError(
        res,
        "Building Abbreviation is required for Multi Family properties",
        400,
      );
    }

    if (
      formData.isMultiUnit === undefined ||
      formData.isMultiUnit === null ||
      formData.isMultiUnit === ""
    ) {
      return sendError(
        res,
        "Please specify whether this is a Multi-Unit Building (Yes/No)",
        400,
      );
    }

    const numberErrors = validateBuildingNumbers(formData);
    if (numberErrors.length)
      return sendError(res, numberErrors.join(", "), 400);

    const errors = validateAgainstTemplate(template, formData);
    if (errors.length) return sendError(res, errors.join(", "), 400);

    const doc = await saveSubmission("building", formData, req.user._id);
    return sendSuccess(res, "Building created", { building: doc }, 201);
  } catch (err) {
    return sendError(res, err.message || "Failed to create building", 500);
  }
};

// building details
exports.getBuildingDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const building = await Building.findById(id)
      .populate("createdBy", "preferredName email")
      .populate("portfolio", "portfolioAbbreviation")
      .populate("parentBuilding", "buildingAbbreviation formData.address");

    if (!building) return sendError(res, "Building not found", 404);

    // Get all relevant templates
    const [buildingTemplate, inspectionTemplate, marketingTemplate] =
      await Promise.all([
        FormTemplate.findOne({
          formType: "building",
          isActive: true,
        }),
        FormTemplate.findOne({
          formType: "inspection",
          isActive: true,
        }),
        FormTemplate.findOne({
          formType: "marketing",
          isActive: true,
        }),
      ]);

    if (!buildingTemplate) {
      return sendError(res, "Building form template not found", 404);
    }

    let units = [];
    if (building.isMultiUnit) {
      units = await Building.find({ parentBuilding: building._id })
        .select(
          "unitNumber buildingAbbreviation status formData.bedrooms formData.bathrooms formData.monthlyRent",
        )
        .sort({ unitNumber: 1 })
        .lean();
    }

    return sendSuccess(res, "Building details fetched", {
      building: {
        ...building.toObject(),
        formData: {
          buildingAbbreviation: building.buildingAbbreviation,
          ...building.formData,
        },
        // Include inspection and marketing data if they exist
        inspectionData: building.inspectionData || {},
        marketingData: building.marketingData || {},
      },
      units,
      template: buildingTemplate,
      inspectionTemplate: inspectionTemplate || null,
      marketingTemplate: marketingTemplate || null,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch building details",
      500,
    );
  }
};

// get all buildings
exports.getAllBuildings = async (req, res) => {
  try {
    const {
      portfolioId,
      onlyCities,
      page = 1,
      limit = 10,
      search = "",
      buildingFilter,
      statusFilter,
      unitTypeFilter,
      sortBy,
      sortOrder = "asc",
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const allowedUserIds = await resolveTeamUserIds(req.user);

    const query = {};
    query.parentBuilding = null;

    const andConditions = [];

    // Apply team scope — null means Admin (no restriction)
    if (allowedUserIds !== null) {
      query.createdBy = { $in: allowedUserIds };
    }

    // Build query object
    if (portfolioId && portfolioId !== "All") {
      query.portfolio = portfolioId;
    }
    if (onlyCities && onlyCities === "true") {
      // Return only unique cities
      const cities = await Building.distinct("formData.city", query);
      return sendSuccess(res, "Cities fetched successfully", { cities });
    }

    if (statusFilter && statusFilter !== "All") {
      query.status = statusFilter;
    }

    if (unitTypeFilter && unitTypeFilter !== "All") {
      query["formData.unitType"] = unitTypeFilter;
    }

    if (buildingFilter && buildingFilter !== "All") {
      andConditions.push({
        $or: [
          {
            "formData.address": {
              $regex: buildingFilter,
              $options: "i",
            },
          },
          {
            buildingAbbreviation: {
              $regex: buildingFilter,
              $options: "i",
            },
          },
        ],
      });
    }

    if (search) {
      andConditions.push({
        $or: [
          {
            "formData.fullAddress": {
              $regex: search,
              $options: "i",
            },
          },
          {
            "formData.address": {
              $regex: search,
              $options: "i",
            },
          },
          {
            buildingAbbreviation: {
              $regex: search,
              $options: "i",
            },
          },
        ],
      });
    }

    if (andConditions.length > 0) {
      query.$and = andConditions;
    }

    // Count before pagination
    const totalItems = await Building.countDocuments(query);

    let buildingsQuery = Building.find(query)
      .populate("createdBy", "preferredName email")
      .populate("portfolio", "portfolioAbbreviation _id");

    // Server-side sorting
    if (sortBy) {
      const sortableFieldMap = {
        address: "formData.address",
        fullAddress: "formData.fullAddress",
        unitType: "formData.unitType",
        monthlyRent: "formData.monthlyRent",
        status: "status",
      };
      const mongoSortField = sortableFieldMap[sortBy] || sortBy;
      buildingsQuery = buildingsQuery.sort({
        [mongoSortField]: sortOrder === "desc" ? -1 : 1,
      });
    }

    const buildings = await buildingsQuery.skip(skip).limit(limitNum).lean();

    return sendSuccess(res, "Buildings fetched successfully", {
      buildings,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalItems / limitNum),
        totalItems,
        itemsPerPage: limitNum,
        hasNextPage: pageNum < Math.ceil(totalItems / limitNum),
        hasPrevPage: pageNum > 1,
      },
      stats: {
        vacantCount: await Building.countDocuments({
          ...query,
          status: "vacant",
        }),
      },
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch buildings", 500);
  }
};

// Get buildings list for dropdowns & filters (no pagination, scoped to team)
exports.getBuildingsList = async (req, res) => {
  try {
    const { portfolioId, includeUnits } = req.query;

    const allowedUserIds = await resolveTeamUserIds(req.user);

    const query = {};

    // Apply team scope — null means Admin (no restriction)
    if (allowedUserIds !== null) {
      query.createdBy = { $in: allowedUserIds };
    }

    // Optionally filter by portfolio
    if (portfolioId && portfolioId !== "All") {
      query.portfolio = portfolioId;
    }

    if (includeUnits !== "true") {
      query.parentBuilding = null;
    }

    const buildings = await Building.find(query)
      .select("buildingAbbreviation formData.address formData.city portfolio")
      .populate("portfolio", "portfolioAbbreviation")
      .lean();

    // Shape the response to be dropdown-friendly
    const buildingList = buildings.map((b) => ({
      _id: b._id,
      label: b.formData?.address || b.buildingAbbreviation || b._id,
      buildingAbbreviation: b.buildingAbbreviation,
      address: b.formData?.address || "",
      city: b.formData?.city || "",
      portfolio: b.portfolio,
    }));

    return sendSuccess(res, "Building list fetched", {
      buildings: buildingList,
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch building list", 500);
  }
};

// update buildings
exports.updateBuilding = async (req, res) => {
  try {
    const { id } = req.params;
    const { inspectionData, marketingData, ...formData } = req.body;

    const building = await Building.findById(id);
    if (!building) return sendError(res, "Building not found", 404);

    // Track changes
    const changes = [];
    Object.keys(formData).forEach((key) => {
      if (building.formData[key] !== formData[key]) {
        changes.push({
          field: key,
          oldValue: building.formData[key],
          newValue: formData[key],
        });
      }
    });

    const template = await FormTemplate.findOne({
      formType: "building",
      isActive: true,
    });
    if (!template)
      return sendError(res, "Building form template not found", 404);

    if (formData.isMultiUnit !== undefined) {
      const nextIsMultiUnit = normalizeBoolean(formData.isMultiUnit);
      if (building.parentBuilding && nextIsMultiUnit) {
        return sendError(
          res,
          "A unit cannot itself be marked as a Multi-Unit Building",
          400,
        );
      }
      if (building.isMultiUnit && !nextIsMultiUnit) {
        const unitCount = await Building.countDocuments({
          parentBuilding: building._id,
        });
        if (unitCount > 0) {
          return sendError(
            res,
            `Cannot disable Multi-Unit Building — ${unitCount} unit(s) are still attached. Remove or reassign them first.`,
            400,
          );
        }
      }
      building.isMultiUnit = nextIsMultiUnit;
    }

    if (
      formData.buildingType === "multi_family" &&
      !formData.buildingAbbreviation
    ) {
      return sendError(
        res,
        "Building Abbreviation is required for Multi Family properties",
        400,
      );
    }

    const errors = validateAgainstTemplate(template, formData);
    if (errors.length) return sendError(res, errors.join(", "), 400);

    // Validate inspection data if provided
    if (inspectionData) {
      const inspectionTemplate = await FormTemplate.findOne({
        formType: "inspection",
        isActive: true,
      });

      if (inspectionTemplate) {
        const inspectionErrors = validateAgainstTemplate(
          inspectionTemplate,
          inspectionData,
        );
        if (inspectionErrors.length) {
          return sendError(
            res,
            "Inspection data errors: " + inspectionErrors.join(", "),
            400,
          );
        }
        building.inspectionData = inspectionData;
      }
    }

    // Validate marketing data if provided
    if (marketingData) {
      const marketingTemplate = await FormTemplate.findOne({
        formType: "marketing",
        isActive: true,
      });

      if (marketingTemplate) {
        const marketingErrors = validateAgainstTemplate(
          marketingTemplate,
          marketingData,
        );
        if (marketingErrors.length) {
          return sendError(
            res,
            "Marketing data errors: " + marketingErrors.join(", "),
            400,
          );
        }
        building.marketingData = marketingData;
      }
    }

    if (formData.buildingAbbreviation !== undefined) {
      building.buildingAbbreviation = formData.buildingAbbreviation;
    }

    if (formData.portfolio !== undefined) {
      const check = await findActivePortfolioOrError(formData.portfolio);
      if (check.error) return sendError(res, check.error, check.status);
      building.portfolio = formData.portfolio;
    }

    building.formData = { ...building.formData, ...formData };
    await building.save();

    await AuditService.logActivity({
      entityType: "building",
      entityId: id,
      action: "updated",
      actionDetails: `Building ${building.buildingAbbreviation} updated`,
      changes,
      performedBy: req.user._id,
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    return sendSuccess(res, "Building updated successfully", {
      building,
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to update building", 500);
  }
};

// Bulk update buildings
exports.bulkUpdateBuildings = async (req, res) => {
  try {
    const updates = req.body.updates;

    if (!Array.isArray(updates) || updates.length === 0) {
      return sendError(res, "No building updates provided", 400);
    }

    const results = [];

    for (const update of updates) {
      const { id, ...formData } = update;

      const building = await Building.findById(id);
      if (!building) {
        results.push({ id, success: false, message: "Building not found" });
        continue;
      }

      // fetch template once per building (kept here, since template may differ by type)
      const template = await FormTemplate.findOne({
        formType: "building",
        isActive: true,
      });
      if (!template) {
        results.push({ id, success: false, message: "Template not found" });
        continue;
      }
      const mergedData = {
        ...(building.formData?.toObject?.() || building.formData),
        ...formData,
      };

      // validate merged data
      const errors = validateAgainstTemplate(template, mergedData);
      if (errors.length) {
        results.push({ id, success: false, message: errors.join(", ") });
        continue;
      }

      // Apply updates to top-level fields
      if (formData.buildingAbbreviation !== undefined) {
        building.buildingAbbreviation = formData.buildingAbbreviation;
      }

      if (formData.portfolio !== undefined) {
        const check = await findActivePortfolioOrError(formData.portfolio);
        if (check.error) {
          results.push({ id, success: false, message: check.error });
          continue;
        }
        building.portfolio = formData.portfolio;
      }
      // Save merged formData
      building.formData = mergedData;

      await building.save();

      results.push({ id, success: true, building });
    }

    return sendSuccess(res, "Bulk update completed", { results });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to bulk update buildings",
      500,
    );
  }
};

// delete buildings
exports.deleteBuilding = async (req, res) => {
  try {
    const { id } = req.params;

    const building = await Building.findById(id);
    if (!building) return sendError(res, "Building not found", 404);

    if (building.isMultiUnit) {
      const unitCount = await Building.countDocuments({ parentBuilding: id });
      if (unitCount > 0) {
        return sendError(
          res,
          `Cannot delete this building — ${unitCount} unit(s) are still attached. Delete or reassign the units first.`,
          400,
        );
      }
    }

    await building.deleteOne();

    return sendSuccess(res, "Building deleted successfully");
  } catch (err) {
    return sendError(res, err.message || "Failed to delete building", 500);
  }
};

// Dynamic Inspection & Marketing Forms for Buildings
exports.getBuildingWithInspection = async (req, res) => {
  try {
    const { id } = req.params;
    const building = await Building.findById(id)
      .populate("createdBy", "preferredName email")
      .populate("portfolio", "portfolioAbbreviation");

    if (!building) return sendError(res, "Building not found", 404);

    const buildingTemplate = await FormTemplate.findOne({
      formType: "building",
      isActive: true,
    });

    const inspectionTemplate = await FormTemplate.findOne({
      formType: "inspection",
      isActive: true,
    });

    return sendSuccess(res, "Building details with inspection fetched", {
      building: {
        ...building.toObject(),
        formData: {
          buildingAbbreviation: building.buildingAbbreviation,
          ...building.formData,
        },
      },
      buildingTemplate,
      inspectionTemplate,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch building details",
      500,
    );
  }
};

exports.getBuildingWithMarketing = async (req, res) => {
  try {
    const { id } = req.params;
    const building = await Building.findById(id)
      .populate("createdBy", "preferredName email")
      .populate("portfolio", "portfolioAbbreviation");

    if (!building) return sendError(res, "Building not found", 404);

    const buildingTemplate = await FormTemplate.findOne({
      formType: "building",
      isActive: true,
    });

    const marketingTemplate = await FormTemplate.findOne({
      formType: "marketing",
      isActive: true,
    });

    return sendSuccess(res, "Building details with inspection fetched", {
      building: {
        ...building.toObject(),
        formData: {
          buildingAbbreviation: building.buildingAbbreviation,
          ...building.formData,
        },
      },
      buildingTemplate,
      marketingTemplate,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch building details",
      500,
    );
  }
};

// Update only inspection data for a building
exports.updateBuildingInspection = async (req, res) => {
  try {
    const { id } = req.params;
    const { inspectionData, requestId } = req.body;

    const building = await Building.findById(id);
    if (!building) return sendError(res, "Building not found", 404);

    // Validate inspection data if provided
    if (inspectionData) {
      const inspectionTemplate = await FormTemplate.findOne({
        formType: "inspection",
        isActive: true,
      });

      if (inspectionTemplate) {
        const inspectionErrors = validateAgainstTemplate(
          inspectionTemplate,
          inspectionData,
        );
        if (inspectionErrors.length) {
          return sendError(
            res,
            "Inspection data errors: " + inspectionErrors.join(", "),
            400,
          );
        }
        building.inspectionData = inspectionData;

        // Check if form is complete (all required fields filled)
        const isFormComplete = checkFormCompletion(
          inspectionTemplate,
          inspectionData,
        );

        // If form is complete and requestId is provided, update inspection request
        if (isFormComplete && requestId) {
          const InspectionRequest = require("../../models/InspectionRequest");

          const inspectionRequest = await InspectionRequest.findById(requestId);

          // Allow completion for both "pending" and "scheduled" statuses
          if (
            inspectionRequest &&
            (inspectionRequest.status === "pending" ||
              inspectionRequest.status === "scheduled")
          ) {
            inspectionRequest.status = "completed";
            inspectionRequest.completeDate = new Date();
            await inspectionRequest.save();
          }
        }
      } else {
        return sendError(res, "Inspection template not found", 404);
      }
    } else {
      return sendError(res, "Inspection data is required", 400);
    }

    await building.save();

    return sendSuccess(res, "Building inspection data updated successfully", {
      building,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to update building inspection",
      500,
    );
  }
};

// Update only marketing data for a building
exports.updateBuildingMarketing = async (req, res) => {
  try {
    const { id } = req.params;
    const { marketingData, requestId } = req.body; // Add requestId from request

    const building = await Building.findById(id);
    if (!building) return sendError(res, "Building not found", 404);

    // Validate marketing data if provided
    if (marketingData) {
      const marketingTemplate = await FormTemplate.findOne({
        formType: "marketing",
        isActive: true,
      });

      if (marketingTemplate) {
        const marketingErrors = validateAgainstTemplate(
          marketingTemplate,
          marketingData,
        );
        if (marketingErrors.length) {
          return sendError(
            res,
            "Marketing data errors: " + marketingErrors.join(", "),
            400,
          );
        }
        building.marketingData = marketingData;

        // Check if form is complete (all required fields filled)
        const isFormComplete = checkFormCompletion(
          marketingTemplate,
          marketingData,
        );

        // If form is complete and requestId is provided, update inspection request
        if (isFormComplete && requestId) {
          const InspectionRequest = require("../../models/InspectionRequest");

          const inspectionRequest = await InspectionRequest.findById(requestId);
          if (inspectionRequest && inspectionRequest.status === "pending") {
            inspectionRequest.status = "completed";
            inspectionRequest.completeDate = new Date();
            await inspectionRequest.save();
          }
        }
      } else {
        return sendError(res, "Marketing template not found", 404);
      }
    } else {
      return sendError(res, "Marketing data is required", 400);
    }

    await building.save();

    return sendSuccess(res, "Building marketing data updated successfully", {
      building,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to update building marketing",
      500,
    );
  }
};

// Helper function to check if form is complete
const checkFormCompletion = (template, formData) => {
  const requiredFields = template.fields.filter((field) => field.required);

  for (const field of requiredFields) {
    const val = formData[field.name];

    // Check if value is empty
    const isEmpty = (v) =>
      v === undefined ||
      v === null ||
      (typeof v === "string" && v.trim() === "") ||
      (Array.isArray(v) && v.length === 0);

    if (isEmpty(val)) {
      return false; // Form is incomplete
    }
  }

  return true; // All required fields are filled
};

// ========================= Portfolios =========================
// Create Portfolio
exports.createPortfolio = async (req, res) => {
  try {
    const template = await FormTemplate.findOne({
      formType: "portfolio",
      isActive: true,
    });

    if (!template)
      return sendError(res, "Portfolio form template not found", 404);

    const formData = req.body;
    const { ownerIds, ...portfolioData } = formData;

    if (
      !portfolioData.portfolioName ||
      portfolioData.portfolioName.trim() === ""
    ) {
      return sendError(res, "Portfolio Name is required", 400);
    }

    if (!portfolioData.portfolioAbbreviation) {
      return sendError(res, "Portfolio Abbreviation is required", 400);
    }

    const errors = validateAgainstTemplate(template, portfolioData);
    if (errors.length) return sendError(res, errors.join(", "), 400);

    // Validate owners if provided
    let validOwners = [];
    if (ownerIds && Array.isArray(ownerIds) && ownerIds.length > 0) {
      const owners = await User.find({ _id: { $in: ownerIds }, role: "Owner" });
      if (owners.length !== ownerIds.length) {
        return sendError(
          res,
          "One or more owners not found or invalid role",
          400,
        );
      }
      validOwners = owners.map((owner) => owner._id);
    }

    // Generate portfolio account number
    const portfolioAccountNumber = await generateAccountNumber({
      counterId: "portfolioAccountNumber",
      startFrom: 10000,
      minDigits: 5,
      maxDigits: 6,
    });

    // Create portfolio with owners
    const portfolio = await Portfolio.create({
      portfolioName: portfolioData.portfolioName,
      portfolioAbbreviation: portfolioData.portfolioAbbreviation,
      portfolioAccountNumber,
      formData: portfolioData,
      owners: validOwners,
      createdBy: req.user._id,
    });

    notifyAttachedOwners(portfolio._id, validOwners);

    // Populate owners for response
    await portfolio.populate(
      "owners",
      "firstName lastName email preferredName",
    );

    return sendSuccess(
      res,
      "Portfolio created successfully",
      { portfolio },
      201,
    );
  } catch (err) {
    // Handle duplicate account number error
    if (err.code === 11000 && err.keyPattern?.portfolioAccountNumber) {
      return sendError(
        res,
        "Duplicate portfolio account number generated. Please try again.",
        500,
      );
    }
    return sendError(res, err.message || "Failed to create portfolio", 500);
  }
};

// Portfolio Details
exports.getPortfolioDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const portfolio = await Portfolio.findById(id)
      .populate("createdBy", "preferredName email")
      .populate(
        "owners",
        "preferredName firstName lastName email phone phoneNumber accountStatus",
      );

    if (!portfolio) return sendError(res, "Portfolio not found", 404);

    const template = await FormTemplate.findOne({
      formType: "portfolio",
      isActive: true,
    });

    return sendSuccess(res, "Portfolio details fetched", {
      portfolio: {
        ...portfolio.toObject(),
        portfolioName: portfolio.portfolioName,
        formData: {
          portfolioAbbreviation: portfolio.portfolioAbbreviation,
          ...portfolio.formData,
        },
      },
      template,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch portfolio details",
      500,
    );
  }
};

// Get all portfolios with pagination
exports.getAllPortfolios = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      portfolioFilter = "",
      buildingCount,
      managementFees,
      repairType,
      sortBy,
      sortOrder = "asc",
      statusFilter,
    } = req.query;

    // Convert to numbers
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // ── Resolve team scope ────────────────────────────────────────
    const allowedUserIds = await resolveTeamUserIds(req.user);

    let query = {};

    // Apply team scope — null means Admin (no restriction)
    if (allowedUserIds !== null) {
      query.createdBy = { $in: allowedUserIds };
    }

    if (statusFilter && statusFilter !== "All") {
      query.status = statusFilter;
    }

    // Search functionality
    if (search) {
      query.$or = [
        { portfolioName: { $regex: search, $options: "i" } },
        { portfolioAbbreviation: { $regex: search, $options: "i" } },
      ];
    }

    // Filter by portfolio abbreviation
    if (portfolioFilter && portfolioFilter !== "All") {
      query.portfolioAbbreviation = portfolioFilter;
    }

    // Filter by repair type
    if (repairType && repairType !== "All") {
      query["formData.repairType"] = { $regex: repairType, $options: "i" };
    }

    // Fetch ALL portfolios that match the initial query (without pagination)
    const portfolios = await Portfolio.find(query)
      .populate("createdBy", "preferredName email")
      .lean();

    // Get building counts for each portfolio
    const portfoliosWithCounts = await Promise.all(
      portfolios.map(async (portfolio) => {
        const buildingCount = await Building.countDocuments({
          portfolio: portfolio._id,
        });

        return {
          ...portfolio,
          buildingCount,
          ownerCount: portfolio.owners?.length || 0,
          managementFees: portfolio.formData?.managementFees || "",
          repairType: portfolio.formData?.repairType || "",
          specialConsiderations:
            portfolio.formData?.specialConsiderations || "",
          assignedlandlorkClerk:
            portfolio.formData?.assignedlandlorkClerk || "",
        };
      }),
    );

    let filteredPortfolios = portfoliosWithCounts;

    // Filter by building count (exact match)
    if (buildingCount) {
      filteredPortfolios = filteredPortfolios.filter(
        (portfolio) => portfolio.buildingCount === parseInt(buildingCount),
      );
    }

    // Filter by management fees (partial match)
    if (managementFees) {
      filteredPortfolios = filteredPortfolios.filter((portfolio) => {
        const fees = portfolio.formData?.managementFees;
        return (
          fees &&
          fees.toString().toLowerCase().includes(managementFees.toLowerCase())
        );
      });
    }

    if (sortBy) {
      filteredPortfolios.sort((a, b) => {
        let aValue = a[sortBy];
        let bValue = b[sortBy];

        // Handle nested formData fields
        if (
          sortBy === "managementFees" ||
          sortBy === "repairType" ||
          sortBy === "specialConsiderations" ||
          sortBy === "assignedlandlorkClerk"
        ) {
          aValue = a.formData?.[sortBy] || "";
          bValue = b.formData?.[sortBy] || "";
        }

        // Handle empty/null values
        if (aValue === null || aValue === undefined || aValue === "—")
          aValue = "";
        if (bValue === null || bValue === undefined || bValue === "—")
          bValue = "";

        // Convert to string for comparison
        aValue = String(aValue).toLowerCase();
        bValue = String(bValue).toLowerCase();

        // Special handling for buildingCount (numeric sorting)
        if (sortBy === "buildingCount") {
          aValue = parseInt(aValue) || 0;
          bValue = parseInt(bValue) || 0;

          if (sortOrder === "asc") {
            return aValue - bValue;
          } else {
            return bValue - aValue;
          }
        }

        // Special handling for managementFees (extract numbers for sorting)
        if (sortBy === "managementFees") {
          const aNum = parseFloat(aValue.replace(/[^\d.-]/g, "")) || 0;
          const bNum = parseFloat(bValue.replace(/[^\d.-]/g, "")) || 0;

          if (sortOrder === "asc") {
            return aNum - bNum;
          } else {
            return bNum - aNum;
          }
        }

        // Default string comparison for other fields
        if (sortOrder === "asc") {
          return aValue.localeCompare(bValue);
        } else {
          return bValue.localeCompare(aValue);
        }
      });
    }

    // Get total count AFTER all filtering
    const totalFilteredCount = filteredPortfolios.length;

    // Apply pagination to filtered results
    const paginatedPortfolios = filteredPortfolios.slice(skip, skip + limitNum);

    return sendSuccess(res, "Portfolios fetched successfully", {
      portfolios: paginatedPortfolios, // ✅ Return paginated filtered results
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalFilteredCount / limitNum), // ✅ Use filtered count
        totalItems: totalFilteredCount, // ✅ Use filtered count
        itemsPerPage: limitNum,
        hasNextPage: pageNum < Math.ceil(totalFilteredCount / limitNum),
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch portfolios", 500);
  }
};

// Get portfolio names/abbreviations only (for dropdowns & filters)
exports.getPortfoliosList = async (req, res) => {
  try {
    const allowedUserIds = await resolveTeamUserIds(req.user);
    const query = { status: "Active" };
    if (allowedUserIds !== null) {
      query.createdBy = { $in: allowedUserIds };
    }

    const portfolios = await Portfolio.find(query)
      .select("portfolioName portfolioAbbreviation")
      .lean();

    return sendSuccess(res, "Portfolio list fetched", { portfolios });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// Update Portfolio
exports.updatePortfolio = async (req, res) => {
  try {
    const { id } = req.params;
    const formData = req.body;
    const { ownerIds, ...portfolioData } = formData;

    // Ensure portfolio exists
    const portfolio = await Portfolio.findById(id);
    if (!portfolio) return sendError(res, "Portfolio not found", 404);

    // Validate against template
    const template = await FormTemplate.findOne({
      formType: "portfolio",
      isActive: true,
    });
    if (!template)
      return sendError(res, "Portfolio form template not found", 404);

    if (
      !portfolioData.portfolioName ||
      portfolioData.portfolioName.trim() === ""
    ) {
      return sendError(res, "Portfolio Name is required", 400);
    }

    if (!portfolioData.portfolioAbbreviation) {
      return sendError(res, "Portfolio Abbreviation is required", 400);
    }

    const errors = validateAgainstTemplate(template, portfolioData);
    if (errors.length) return sendError(res, errors.join(", "), 400);

    const ownersBefore = new Set(portfolio.owners.map(String));

    // Validate and update owners if provided
    if (ownerIds && Array.isArray(ownerIds)) {
      const owners = await User.find({ _id: { $in: ownerIds }, role: "Owner" });
      if (owners.length !== ownerIds.length) {
        return sendError(
          res,
          "One or more owners not found or invalid role",
          400,
        );
      }
      portfolio.owners = owners.map((owner) => owner._id);
    }

    // Apply updates to portfolio fields
    if (portfolioData.portfolioName !== undefined)
      portfolio.portfolioName = portfolioData.portfolioName;
    if (portfolioData.portfolioAbbreviation !== undefined)
      portfolio.portfolioAbbreviation = portfolioData.portfolioAbbreviation;

    // Merge formData
    portfolio.formData = { ...portfolio.formData, ...portfolioData };

    await portfolio.save();

    notifyAttachedOwners(
      portfolio._id,
      portfolio.owners.filter((o) => !ownersBefore.has(String(o))),
    );

    // Populate owners for response
    await portfolio.populate(
      "owners",
      "firstName lastName email preferredName",
    );

    return sendSuccess(res, "Portfolio updated successfully", { portfolio });
  } catch (err) {
    return sendError(res, err.message || "Failed to update portfolio", 500);
  }
};

// Bulk Update Portfolio
exports.bulkUpdatePortfolios = async (req, res) => {
  try {
    const updates = req.body.updates;

    if (!Array.isArray(updates) || updates.length === 0) {
      return sendError(res, "No portfolio updates provided", 400);
    }

    const results = [];

    for (const update of updates) {
      const { id, ...formData } = update;

      const portfolio = await Portfolio.findById(id);
      if (!portfolio) {
        results.push({ id, success: false, message: "Portfolio not found" });
        continue;
      }

      const template = await FormTemplate.findOne({
        formType: "portfolio",
        isActive: true,
      });
      if (!template) {
        results.push({ id, success: false, message: "Template not found" });
        continue;
      }

      const mergedData = {
        ...(portfolio.formData?.toObject?.() || portfolio.formData),
        ...formData,
      };

      const errors = validateAgainstTemplate(template, mergedData);
      if (errors.length) {
        results.push({ id, success: false, message: errors.join(", ") });
        continue;
      }

      // Apply updates
      if (formData.portfolioName !== undefined)
        portfolio.portfolioName = formData.portfolioName;
      if (formData.portfolioAbbreviation !== undefined)
        portfolio.portfolioAbbreviation = formData.portfolioAbbreviation;

      portfolio.formData = mergedData;

      await portfolio.save();

      results.push({ id, success: true, portfolio });
    }

    return sendSuccess(res, "Bulk update completed", { results });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to bulk update portfolios",
      500,
    );
  }
};

// Update Portfolio Status
exports.updatePortfolioStatus = async (req, res) => {
  try {
    const { ids, status } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return sendError(res, "Portfolio id(s) are required", 400);
    }
    if (!ALLOWED_PORTFOLIO_STATUSES.includes(status)) {
      return sendError(
        res,
        `status must be one of: ${ALLOWED_PORTFOLIO_STATUSES.join(", ")}`,
        400,
      );
    }

    const portfolios = await Portfolio.find({ _id: { $in: ids } })
      .select("_id portfolioAbbreviation owners status")
      .lean();

    if (portfolios.length === 0) {
      return sendError(res, "No matching portfolios found", 404);
    }

    const foundIds = portfolios.map((p) => String(p._id));
    const notFound = ids.map(String).filter((id) => !foundIds.includes(id));

    const toChange = portfolios.filter(
      (p) => (p.status || "Active") !== status,
    );
    const toChangeIds = toChange.map((p) => String(p._id));

    if (toChangeIds.length > 0) {
      await Portfolio.updateMany(
        { _id: { $in: toChangeIds } },
        {
          $set: {
            status,
            statusChangedAt: new Date(),
            statusChangedBy: req.user._id,
          },
        },
      );

      if (status === "Deactivated") {
        const ownerIds = [
          ...new Set(toChange.flatMap((p) => p.owners.map(String))),
        ];
        await invalidateSessionsForOwnersWithNoActivePortfolio(ownerIds);
      }

      await Promise.all(
        toChange.map((p) =>
          AuditService.logActivity({
            entityType: "portfolio",
            entityId: p._id,
            action: "updated",
            actionDetails: `Portfolio ${p.portfolioAbbreviation} ${status.toLowerCase()}`,
            changes: [
              {
                field: "status",
                oldValue: p.status || "Active",
                newValue: status,
              },
            ],
            performedBy: req.user._id,
            ipAddress: req.ip,
            userAgent: req.get("User-Agent"),
          }),
        ),
      );
    }

    return sendSuccess(
      res,
      toChangeIds.length > 0
        ? `Portfolio(s) ${status.toLowerCase()} successfully`
        : `Selected portfolio(s) are already ${status.toLowerCase()}`,
      {
        updatedCount: toChangeIds.length, // real count, not "matched" count
        updatedIds: toChangeIds,
        alreadyInStatusCount: portfolios.length - toChangeIds.length,
        notFound,
      },
    );
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to update portfolio status",
      500,
    );
  }
};

// Delete Portfolio
exports.deletePortfolio = async (req, res) => {
  try {
    const { id } = req.params;

    const portfolio = await Portfolio.findById(id);
    if (!portfolio) return sendError(res, "Portfolio not found", 404);

    await portfolio.deleteOne();

    return sendSuccess(res, "Portfolio deleted successfully");
  } catch (err) {
    return sendError(res, err.message || "Failed to delete portfolio", 500);
  }
};

// Get All buildings by Portfolio
exports.getBuildingsByPortfolio = async (req, res) => {
  try {
    const { portfolioId } = req.params;

    // Ensure portfolio exists
    const portfolio = await Portfolio.findById(portfolioId)
      .populate("createdBy", "preferredName email")
      .populate("owners", "preferredName email phoneNumber");
    if (!portfolio) return sendError(res, "Portfolio not found", 404);

    // Fetch all buildings under this portfolio
    const buildings = await Building.find({
      portfolio: portfolioId,
      parentBuilding: null, // exclude units — only top-level buildings belong in this list
    })
      .populate("createdBy", "preferredName email")
      .populate("portfolio", "portfolioAbbreviation")
      .lean();

    return sendSuccess(res, "Buildings for portfolio fetched successfully", {
      portfolio: {
        ...portfolio.toObject(),
        formData: {
          portfolioAbbreviation: portfolio.portfolioAbbreviation,
          ...(portfolio.formData || {}),
        },
      },
      buildings: buildings.map((b) => ({
        id: b._id,
        _id: b._id,
        buildingAbbreviation: b.buildingAbbreviation,
        address: b.formData?.address || "",
        fullAddress: b.formData?.fullAddress || "",
        city: b.formData?.city || "",
        status: b.status || "vacant",
        monthlyRent: b.formData?.monthlyRent || 0,
        buildingType: b.formData?.buildingType || "",
        isMultiUnit: b.isMultiUnit || false,
        managementFee: b.formData?.managementFee ?? "",
        assignedPropertyManager: b.formData?.assignedPropertyManager || null,
      })),
    });
  } catch (err) {
    return sendError(res, err);
  }
};

// ── Portfolio landing cards ─────────────────────────────────────────────────
// Open = primary status "open" AND not marked Completed by the vendor.
const NOT_OPEN_DYNAMIC_STATUSES = ["Completed"];

exports.getPortfolioStats = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return sendError(res, "Invalid portfolio id", 400);
    }

    const exists = await Portfolio.exists({ _id: id });
    if (!exists) return sendError(res, "Portfolio not found", 404);

    // This portfolio's buildings + the units inside them
    const parentIds = await Building.find({ portfolio: id }).distinct("_id");
    const buildingIds = parentIds.length
      ? await Building.find({
          $or: [
            { _id: { $in: parentIds } },
            { parentBuilding: { $in: parentIds } },
          ],
        }).distinct("_id")
      : [];

    let openWorkOrders = 0;
    if (buildingIds.length) {
      const notOpenStatusIds = await WODynamicStatus.find({
        name: { $in: NOT_OPEN_DYNAMIC_STATUSES },
      }).distinct("_id");

      openWorkOrders = await WorkOrder.countDocuments({
        building: { $in: buildingIds },
        status: "open",
        dynamicStatus: { $nin: notOpenStatusIds },
      });
    }

    return sendSuccess(res, "Portfolio stats fetched", {
      openWorkOrders,
      // Not built yet: static 0 until those modules exist
      tenantsOnEviction: 0,
      vacancyProspects: 0,
      tenancies: 0,
      upcomingRentIncreases: 0,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch portfolio stats",
      500,
    );
  }
};

// ── Portfolio Summary edit — rules ──────────────────────────────────────────
const REPAIR_OPTIONS = [
  "diy_landlord",
  "preferred_vendor_list",
  "renters_choice_vendors",
];
const PREFERRED_VENDOR_KEYS = [
  "electricianName",
  "plumberName",
  "hvacName",
  "applianceName",
  "landscaperName",
];
const BUILDING_EDIT_STATUSES = ["vacant", "occupied", "deactivated"]; // = Building schema enum
const MANAGEMENT_FEE_TYPE_VALUES = ["flat", "percent", "greater"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BUILDING_UPDATES = 500;

const isBlank = (v) => v === undefined || v === null || v === "";
const cleanStr = (v, max = 200) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const cleanAmount = (v) => (isBlank(v) ? "" : String(v).trim());
const isValidAmount = (v) => isBlank(v) || DECIMAL_2.test(String(v).trim());
const isValidPercent = (v) =>
  isBlank(v) || (DECIMAL_2.test(String(v).trim()) && Number(v) <= 100);

function normalizeRepairs(input) {
  const src = input && typeof input === "object" ? input : {};
  const errors = [];
  const option = isBlank(src.option) ? null : src.option;

  if (option !== null && !REPAIR_OPTIONS.includes(option)) {
    errors.push("Invalid Repairs & Maintenance option");
  }
  if (!isValidAmount(src.spendingLimit)) {
    errors.push('"Spending Limit" must be a valid amount');
  }

  // Vendor names only make sense for "Use Preferred Vendor List"
  const isPreferred = option === "preferred_vendor_list";
  const value = {
    option,
    spendingLimit: cleanAmount(src.spendingLimit),
    spendingConsideration: cleanStr(src.spendingConsideration, 2000),
  };
  PREFERRED_VENDOR_KEYS.forEach((key) => {
    value[key] = isPreferred ? cleanStr(src[key], 120) : "";
  });

  return { value, errors };
}

// Builds a $set for ONE building from whitelisted fields only
function normalizeBuildingEdit(input) {
  const errors = [];
  const set = {};

  if (input.status !== undefined) {
    if (BUILDING_EDIT_STATUSES.includes(input.status))
      set.status = input.status;
    else errors.push("Invalid building occupancy status");
  }

  if (input.monthlyRent !== undefined) {
    if (isValidAmount(input.monthlyRent))
      set["formData.monthlyRent"] = cleanAmount(input.monthlyRent);
    else errors.push('"Rent" must be a valid amount');
  }

  if (input.managementFee !== undefined) {
    const fee =
      input.managementFee && typeof input.managementFee === "object"
        ? input.managementFee
        : {};
    const type = fee.type || "flat";
    if (!MANAGEMENT_FEE_TYPE_VALUES.includes(type))
      errors.push("Invalid management fee type");
    if (!isValidAmount(fee.flatAmount))
      errors.push('"Management Fee" amount must be a valid amount');
    if (!isValidPercent(fee.percent))
      errors.push('"Management Fee" % must be between 0 and 100');
    set["formData.managementFee"] = {
      type,
      flatAmount: cleanAmount(fee.flatAmount),
      percent: cleanAmount(fee.percent),
    };
  }

  if (input.assignedPropertyManager !== undefined) {
    set["formData.assignedPropertyManager"] = {
      name: cleanStr(input.assignedPropertyManager?.name, 120),
    };
  }

  return { set, errors };
}

exports.updatePortfolioSummary = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return sendError(res, "Invalid portfolio id", 400);
  }

  const session = await mongoose.startSession();
  try {
    const body = req.body || {};

    const portfolio = await Portfolio.findById(id);
    if (!portfolio) return sendError(res, "Portfolio not found", 404);
    if (portfolio.status === "Deactivated") {
      return sendError(res, "Reactivate the portfolio before editing it.", 400);
    }

    const errors = [];

    // ── Portfolio fields (account number is never accepted) ──
    const portfolioName = cleanStr(body.portfolioName, 150);
    const portfolioAbbreviation = cleanStr(body.portfolioAbbreviation, 50);
    if (!portfolioName) errors.push("Portfolio Name is required");
    if (!portfolioAbbreviation)
      errors.push("Portfolio Abbreviation is required");

    const managementStartDate = cleanStr(body.managementStartDate, 10);
    if (
      managementStartDate &&
      (!ISO_DATE.test(managementStartDate) ||
        Number.isNaN(Date.parse(managementStartDate)))
    ) {
      errors.push("Management Start Date is invalid");
    }

    // Repairs & Maintenance is optional — only touched when the client sends it
    const repairs =
      body.repairsMaintenance !== undefined
        ? normalizeRepairs(body.repairsMaintenance)
        : null;
    if (repairs) errors.push(...repairs.errors);

    // ── Buildings (only the rows the user changed) ──
    const buildingInputs = Array.isArray(body.buildings) ? body.buildings : [];
    if (buildingInputs.length > MAX_BUILDING_UPDATES) {
      errors.push("Too many building updates in one request");
    }

    const buildingOps = [];
    buildingInputs.forEach((b) => {
      if (!b || !mongoose.isValidObjectId(b.id)) {
        errors.push("Invalid building id");
        return;
      }
      const { set, errors: rowErrors } = normalizeBuildingEdit(b);
      errors.push(...rowErrors);
      if (Object.keys(set).length > 0) {
        buildingOps.push({
          updateOne: {
            // Scoped to THIS portfolio's top-level buildings only
            filter: {
              _id: b.id,
              portfolio: portfolio._id,
              parentBuilding: null,
            },
            update: { $set: set },
          },
        });
      }
    });

    if (errors.length) {
      return sendError(res, [...new Set(errors)].join(", "), 400);
    }

    // Every building must belong to this portfolio
    if (buildingOps.length) {
      const ids = [
        ...new Set(buildingOps.map((op) => String(op.updateOne.filter._id))),
      ];
      const owned = await Building.countDocuments({
        _id: { $in: ids },
        portfolio: portfolio._id,
        parentBuilding: null,
      });
      if (owned !== ids.length) {
        return sendError(
          res,
          "One or more buildings do not belong to this portfolio",
          400,
        );
      }
    }

    // ── Audit trail ──
    const prevForm = portfolio.formData || {};
    const changes = [];
    const track = (field, oldValue, newValue) => {
      if (JSON.stringify(oldValue ?? "") !== JSON.stringify(newValue ?? "")) {
        changes.push({ field, oldValue, newValue });
      }
    };
    track("portfolioName", portfolio.portfolioName, portfolioName);
    track(
      "portfolioAbbreviation",
      portfolio.portfolioAbbreviation,
      portfolioAbbreviation,
    );
    track(
      "managementStartDate",
      prevForm.managementStartDate,
      managementStartDate,
    );
    if (repairs) {
      track("repairsMaintenance", prevForm.repairsMaintenance, repairs.value);
    }

    // ── Apply ──
    portfolio.portfolioName = portfolioName;
    portfolio.portfolioAbbreviation = portfolioAbbreviation;
    portfolio.formData = {
      ...prevForm,
      // createPortfolio stores these inside formData too — keep them in sync
      portfolioName,
      portfolioAbbreviation,
      managementStartDate,
      ...(repairs && { repairsMaintenance: repairs.value }),
    };
    portfolio.markModified("formData");

    await session.withTransaction(async () => {
      await portfolio.save({ session });
      if (buildingOps.length) {
        await Building.bulkWrite(buildingOps, { session, ordered: true });
      }
    });

    // Audit must never turn a committed save into an error response
    if (changes.length || buildingOps.length) {
      try {
        await AuditService.logActivity({
          entityType: "portfolio",
          entityId: portfolio._id,
          action: "updated",
          actionDetails: `Portfolio ${portfolioAbbreviation} updated${
            buildingOps.length ? ` (${buildingOps.length} building(s))` : ""
          }`,
          changes,
          performedBy: req.user._id,
          ipAddress: req.ip,
          userAgent: req.get("User-Agent"),
        });
      } catch (auditErr) {
        console.error("Portfolio summary audit log failed:", auditErr);
      }
    }

    return sendSuccess(res, "Portfolio updated successfully", {
      portfolioId: portfolio._id,
      updatedBuildings: buildingOps.length,
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to update portfolio", 500);
  } finally {
    await session.endSession();
  }
};

// ========================= Add Owner =========================
// Add owners to portfolio
exports.addOwnersToPortfolio = async (req, res) => {
  try {
    const { portfolioId } = req.params;
    if (!mongoose.isValidObjectId(portfolioId)) {
      return sendError(res, "Invalid portfolio id", 400);
    }

    const rawIds = Array.isArray(req.body?.ownerIds) ? req.body.ownerIds : [];
    const ownerIds = [...new Set(rawIds.map(String))];
    if (ownerIds.length === 0) {
      return sendError(res, "Owner IDs are required", 400);
    }
    if (ownerIds.length > 50) {
      return sendError(res, "Too many owners in one request", 400);
    }
    if (ownerIds.some((oid) => !mongoose.isValidObjectId(oid))) {
      return sendError(res, "One or more owner ids are invalid", 400);
    }

    const portfolio = await Portfolio.findById(portfolioId).select(
      "status portfolioAbbreviation owners",
    );
    if (!portfolio) return sendError(res, "Portfolio not found", 404);
    if (portfolio.status === "Deactivated") {
      return sendError(
        res,
        "Reactivate the portfolio before adding owners.",
        400,
      );
    }

    const validCount = await User.countDocuments({
      _id: { $in: ownerIds },
      role: "Owner",
    });
    if (validCount !== ownerIds.length) {
      return sendError(
        res,
        "One or more owners not found or invalid role",
        400,
      );
    }

    const alreadyAttached = new Set(portfolio.owners.map(String));
    const newIds = ownerIds.filter((oid) => !alreadyAttached.has(oid));

    const updated = await Portfolio.findByIdAndUpdate(
      portfolioId,
      { $addToSet: { owners: { $each: newIds } } },
      { new: true },
    ).populate(
      "owners",
      "preferredName firstName lastName email phone phoneNumber accountStatus",
    );

    notifyAttachedOwners(portfolio._id, newIds);

    if (newIds.length) {
      try {
        await AuditService.logActivity({
          entityType: "portfolio",
          entityId: portfolio._id,
          action: "updated",
          actionDetails: `${newIds.length} owner(s) attached to portfolio ${portfolio.portfolioAbbreviation}`,
          changes: [{ field: "owners", oldValue: null, newValue: newIds }],
          performedBy: req.user._id,
          ipAddress: req.ip,
          userAgent: req.get("User-Agent"),
        });
      } catch (auditErr) {
        console.error("Add owners audit log failed:", auditErr);
      }
    }

    return sendSuccess(
      res,
      newIds.length
        ? "Owners added. They'll receive an email to set up or access their Owner Portal."
        : "Selected owners are already attached",
      { portfolio: updated, addedCount: newIds.length },
    );
  } catch (err) {
    return sendError(res, err.message || "Failed to add owners", 500);
  }
};

// Resend owner portal invitation (new link; the previous one stops working)
const RESEND_COOLDOWN_MS = 2 * 60 * 1000;

exports.resendOwnerInvite = async (req, res) => {
  try {
    const { portfolioId, ownerId } = req.params;
    if (
      !mongoose.isValidObjectId(portfolioId) ||
      !mongoose.isValidObjectId(ownerId)
    ) {
      return sendError(res, "Invalid id", 400);
    }

    const portfolio = await Portfolio.findOne({
      _id: portfolioId,
      owners: ownerId,
    })
      .select(
        "status portfolioName portfolioAbbreviation portfolioAccountNumber",
      )
      .lean();
    if (!portfolio) {
      return sendError(res, "This owner is not attached to the portfolio", 404);
    }
    if (portfolio.status === "Deactivated") {
      return sendError(
        res,
        "Reactivate the portfolio before sending invitations.",
        400,
      );
    }

    const owner = await User.findOne({ _id: ownerId, role: "Owner" })
      .select("email preferredName accountStatus isActive ownerInviteSentAt")
      .lean();
    if (!owner) return sendError(res, "Owner not found", 404);
    if (!owner.isActive) {
      return sendError(res, "This owner's account is deactivated.", 400);
    }
    if (owner.accountStatus !== "invited") {
      return sendError(
        res,
        "This owner has already set up their account.",
        409,
      );
    }
    if (
      owner.ownerInviteSentAt &&
      Date.now() - new Date(owner.ownerInviteSentAt).getTime() <
        RESEND_COOLDOWN_MS
    ) {
      return sendError(
        res,
        "An invitation was just sent. Please wait a couple of minutes.",
        429,
      );
    }

    await sendOwnerInvite({ owner, portfolio }); // awaited so a send failure is reported

    AuditService.logActivity({
      entityType: "portfolio",
      entityId: portfolio._id,
      action: "updated",
      actionDetails: `Owner invitation re-sent to ${owner.email} for ${portfolio.portfolioAbbreviation}`,
      changes: [],
      performedBy: req.user._id,
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }).catch((e) => console.error("Resend invite audit failed:", e));

    return sendSuccess(res, `Invitation re-sent to ${owner.email}`);
  } catch (err) {
    return sendError(res, "Failed to resend invitation", 500);
  }
};

// Remove owner from portfolio
exports.removeOwnerFromPortfolio = async (req, res) => {
  try {
    const { portfolioId, ownerId } = req.params;

    const portfolio = await Portfolio.findByIdAndUpdate(
      portfolioId,
      { $pull: { owners: ownerId } },
      { new: true },
    ).populate("owners", "preferredName email");

    if (!portfolio) return sendError(res, "Portfolio not found", 404);

    return sendSuccess(res, "Owner removed from portfolio", { portfolio });
  } catch (err) {
    return sendError(res, err.message || "Failed to remove owner", 500);
  }
};
