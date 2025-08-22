const Building = require("../../models/Building");
const FormTemplate = require("../../models/FormTemplate");
const Portfolio = require("../../models/Portfolio");
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
      createdBy: userId,
    });
  }
  if (formType === "portfolio") {
    const { portfolioAbbreviation, ...restData } = formData;
    return Portfolio.create({
      portfolioAbbreviation,
      formData: restData,
      createdBy: userId,
    });
  }
  throw new Error("Unsupported form type");
}

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

exports.createPortfolio = async (req, res) => {
  try {
    const template = await FormTemplate.findOne({
      formType: "portfolio",
      isActive: true,
    });
    if (!template)
      return sendError(res, "Portfolio form template not found", 404);

    const formData = req.body;

    // Validate portfolioAbbreviation exists
    if (!formData.portfolioAbbreviation) {
      return sendError(res, "Portfolio Abbreviation is required", 400);
    }

    const errors = validateAgainstTemplate(template, formData);
    if (errors.length) return sendError(res, errors.join(", "), 400);

    const doc = await saveSubmission("portfolio", formData, req.user._id);
    return sendSuccess(res, "Portfolio created", { portfolio: doc }, 201);
  } catch (err) {
    return sendError(res, err.message || "Failed to create portfolio", 500);
  }
};

exports.getBuildingDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const building = await Building.findById(id)
      .populate("createdBy", "preferredName email")
      .populate("portfolio", "portfolioAbbreviation");
    if (!building) return sendError(res, "Building not found", 404);

    const template = await FormTemplate.findOne({
      formType: "building",
      isActive: true,
    });

    return sendSuccess(res, "Building details fetched", {
      building: {
        ...building.toObject(),
        formData: {
          buildingAbbreviation: building.buildingAbbreviation,
          ...building.formData,
        },
      },
      template,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch building details",
      500
    );
  }
};

exports.getPortfolioDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const portfolio = await Portfolio.findById(id).populate(
      "createdBy",
      "preferredName email"
    );
    if (!portfolio) return sendError(res, "Portfolio not found", 404);

    const template = await FormTemplate.findOne({
      formType: "portfolio",
      isActive: true,
    });

    return sendSuccess(res, "Portfolio details fetched", {
      portfolio: {
        ...portfolio.toObject(),
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

exports.getAllBuildings = async (req, res) => {
  try {
    const { portfolioId } = req.query;

    // Build query object
    const query = {};
    if (portfolioId && portfolioId !== "All") {
      query.portfolio = portfolioId;
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

exports.getAllPortfolios = async (req, res) => {
  try {
    const portfolios = await Portfolio.find({})
      .populate("createdBy", "preferredName email")
      .lean();

    return sendSuccess(res, "Portfolios fetched successfully", { portfolios });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch portfolios", 500);
  }
};

exports.updateBuilding = async (req, res) => {
  try {
    const { id } = req.params;
    const formData = req.body;

    // ensure building exists
    const building = await Building.findById(id);
    if (!building) return sendError(res, "Building not found", 404);

    // validate template rules
    const template = await FormTemplate.findOne({
      formType: "building",
      isActive: true,
    });
    if (!template)
      return sendError(res, "Building form template not found", 404);

    // CONDITIONAL VALIDATION for update
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

    // update main + formData fields
    if (formData.buildingAbbreviation !== undefined) {
      building.buildingAbbreviation = formData.buildingAbbreviation;
    }
    if (formData.portfolio !== undefined) {
      building.portfolio = formData.portfolio;
    }

    // merge formData
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
