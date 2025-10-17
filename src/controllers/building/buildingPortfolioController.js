const Building = require("../../models/Building");
const FormTemplate = require("../../models/FormTemplate");
const Portfolio = require("../../models/Portfolio");
const User = require("../../models/User");
const {
  generatePortfolioAccountNumber,
} = require("../../utils/portfolioCounter");
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

async function saveSubmission(formType, formData, userId) {
  if (formType === "building") {
    const { buildingAbbreviation, portfolio, ...restData } = formData;

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
        400
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
      .populate("portfolio", "portfolioAbbreviation");
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
      template: buildingTemplate,
      inspectionTemplate: inspectionTemplate || null,
      marketingTemplate: marketingTemplate || null,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch building details",
      500
    );
  }
};

// get all buildings
exports.getAllBuildings = async (req, res) => {
  try {
    const { portfolioId, onlyCities } = req.query;

    // Build query object
    const query = {};
    if (portfolioId && portfolioId !== "All") {
      query.portfolio = portfolioId;
    }

    if (onlyCities && onlyCities === "true") {
      // Return only unique cities
      const cities = await Building.distinct("formData.city", query);
      return sendSuccess(res, "Cities fetched successfully", { cities });
    }

    const buildings = await Building.find(query)
      .populate("createdBy", "preferredName email")
      .populate("portfolio", "portfolioAbbreviation")
      .lean();

    return sendSuccess(res, "Buildings fetched successfully", { buildings });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch buildings", 500);
  }
};

// update buildings
exports.updateBuilding = async (req, res) => {
  try {
    const { id } = req.params;
    const { inspectionData, marketingData, ...formData } = req.body;

    const building = await Building.findById(id);
    if (!building) return sendError(res, "Building not found", 404);

    const template = await FormTemplate.findOne({
      formType: "building",
      isActive: true,
    });
    if (!template)
      return sendError(res, "Building form template not found", 404);

    if (
      formData.buildingType === "multi_family" &&
      !formData.buildingAbbreviation
    ) {
      return sendError(
        res,
        "Building Abbreviation is required for Multi Family properties",
        400
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
          inspectionData
        );
        if (inspectionErrors.length) {
          return sendError(
            res,
            "Inspection data errors: " + inspectionErrors.join(", "),
            400
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
          marketingData
        );
        if (marketingErrors.length) {
          return sendError(
            res,
            "Marketing data errors: " + marketingErrors.join(", "),
            400
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
      500
    );
  }
};

// delete buildings
exports.deleteBuilding = async (req, res) => {
  try {
    const { id } = req.params;

    const building = await Building.findById(id);
    if (!building) return sendError(res, "Building not found", 404);

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
      500
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
      500
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
          inspectionData
        );
        if (inspectionErrors.length) {
          return sendError(
            res,
            "Inspection data errors: " + inspectionErrors.join(", "),
            400
          );
        }
        building.inspectionData = inspectionData;

        // Check if form is complete (all required fields filled)
        const isFormComplete = checkFormCompletion(
          inspectionTemplate,
          inspectionData
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
      500
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
          marketingData
        );
        if (marketingErrors.length) {
          return sendError(
            res,
            "Marketing data errors: " + marketingErrors.join(", "),
            400
          );
        }
        building.marketingData = marketingData;

        // Check if form is complete (all required fields filled)
        const isFormComplete = checkFormCompletion(
          marketingTemplate,
          marketingData
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
      500
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
          400
        );
      }
      validOwners = owners.map((owner) => owner._id);
    }

    // Generate portfolio account number
    const portfolioAccountNumber = await generatePortfolioAccountNumber();

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
      "firstName lastName email preferredName"
    );

    return sendSuccess(
      res,
      "Portfolio created successfully",
      { portfolio },
      201
    );
  } catch (err) {
    // Handle duplicate account number error
    if (err.code === 11000 && err.keyPattern?.portfolioAccountNumber) {
      return sendError(
        res,
        "Duplicate portfolio account number generated. Please try again.",
        500
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
      500
    );
  }
};

// Get all portfolios with pagination
exports.getAllPortfolios = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", filter = "" } = req.query;

    // Convert to numbers
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    let query = {};

    // Search functionality
    if (search) {
      query.$or = [
        { portfolioName: { $regex: search, $options: "i" } },
        { portfolioAbbreviation: { $regex: search, $options: "i" } },
      ];
    }

    // Filter by portfolio abbreviation
    if (filter && filter !== "All") {
      query.portfolioAbbreviation = filter;
    }

    // Get total count for pagination
    const totalCount = await Portfolio.countDocuments(query);

    // Fetch portfolios with pagination
    const portfolios = await Portfolio.find(query)
      .populate("createdBy", "preferredName email")
      .skip(skip)
      .limit(limitNum)
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
        };
      })
    );

    return sendSuccess(res, "Portfolios fetched successfully", {
      portfolios: portfoliosWithCounts,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalItems: totalCount,
        itemsPerPage: limitNum,
        hasNextPage: pageNum < Math.ceil(totalCount / limitNum),
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
    const portfolios = await Portfolio.find({})
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
          400
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
      "firstName lastName email preferredName"
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
      500
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
    const buildings = await Building.find({ portfolio: portfolioId })
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
        buildingAbbreviation: b.buildingAbbreviation,
        address: b.formData?.address || "",
        fullAddress: b.formData?.fullAddress || "",
        city: b.formData?.city || "",
        status: b.status || "vacant",
        monthlyRent: b.formData?.monthlyRent || 0,
        buildingType: b.formData?.buildingType || "",
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
        400
      );
    }

    const portfolio = await Portfolio.findByIdAndUpdate(
      portfolioId,
      { $addToSet: { owners: { $each: ownerIds } } },
      { new: true }
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
      { new: true }
    ).populate("owners", "preferredName email");

    if (!portfolio) return sendError(res, "Portfolio not found", 404);

    return sendSuccess(res, "Owner removed from portfolio", { portfolio });
  } catch (err) {
    return sendError(res, err.message || "Failed to remove owner", 500);
  }
};
