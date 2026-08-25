const Building = require("../../models/Building");
const FormTemplate = require("../../models/FormTemplate");
const Portfolio = require("../../models/Portfolio");
const User = require("../../models/User");
const AuditService = require("../../services/auditService");
const { generateAccountNumber } = require("../../utils/generateAccountNumber");
const resolveTeamUserIds = require("../../utils/resolveTeamUserIds");
const { sendSuccess, sendError } = require("../../utils/response");

/**
 * validateAgainstTemplate(template, formData)
 * - template.fields is array of field definitions
 * - formData is incoming request body (object)
 */
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
      floorNumber: "",
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
      .populate("owners", "preferredName firstName lastName email phoneNumber");

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
    const query = {};
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
      })),
    });
  } catch (err) {
    return sendError(res, err);
  }
};

// ========================= Add Owner =========================
// Add owners to portfolio
exports.addOwnersToPortfolio = async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { ownerIds } = req.body; // array of userIds

    if (!Array.isArray(ownerIds) || ownerIds.length === 0) {
      return sendError(res, "Owner IDs are required", 400);
    }

    // Ensure all users exist & have role = Owner
    const owners = await User.find({ _id: { $in: ownerIds }, role: "Owner" });
    if (owners.length !== ownerIds.length) {
      return sendError(
        res,
        "One or more owners not found or invalid role",
        400,
      );
    }

    const portfolio = await Portfolio.findByIdAndUpdate(
      portfolioId,
      { $addToSet: { owners: { $each: ownerIds } } },
      { new: true },
    ).populate("owners", "preferredName email");

    if (!portfolio) return sendError(res, "Portfolio not found", 404);

    return sendSuccess(res, "Owners added to portfolio", { portfolio });
  } catch (err) {
    return sendError(res, err.message || "Failed to add owners", 500);
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
