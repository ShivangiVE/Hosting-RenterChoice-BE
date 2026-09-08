const Building = require("../../models/Building");
const AuditService = require("../../services/auditService");
const { sendError, sendSuccess } = require("../../utils/response");

/**
 * Auto-generates the next sequential unit number for a parent building
 * ("Unit 1", "Unit 2", ...) when the caller doesn't supply one. Loops to
 * skip over any number already taken — covers both a concurrent create
 * racing this one, and a previously manually-named unit ("Unit 3") that
 * happens to collide with the auto-sequence.
 */
const generateNextUnitNumber = async (parentId) => {
  const siblingCount = await Building.countDocuments({
    parentBuilding: parentId,
  });

  let offset = 1;
  let candidate = `Unit ${siblingCount + offset}`;
  while (
    await Building.exists({ parentBuilding: parentId, unitNumber: candidate })
  ) {
    offset += 1;
    candidate = `Unit ${siblingCount + offset}`;
  }
  return candidate;
};

/**
 * Create a Unit under a top-level Multi-Unit Building.
 *
 * A Unit is deliberately just a Building document with `parentBuilding`
 * set and `isMultiUnit` forced to false — it is NOT a separate model.
 * That means every existing single-building endpoint (getBuildingDetails,
 * updateBuilding, deleteBuilding, getBuildingWithInspection, etc.) already
 * works correctly for a unit by its `_id` with zero additional code.
 * This file only adds the two operations that are genuinely unit-specific:
 * creating one under a parent, and listing a parent's units.
 */
exports.createUnit = async (req, res) => {
  try {
    const { id: parentId } = req.params;

    const parent = await Building.findById(parentId);
    if (!parent) return sendError(res, "Parent building not found", 404);

    if (!parent.isMultiUnit) {
      return sendError(
        res,
        "This building is not configured as a Multi-Unit Building. Enable Multi-Unit Building on it before adding units.",
        400,
      );
    }
    if (parent.parentBuilding) {
      return sendError(res, "Units cannot be created under another unit", 400);
    }

    const { unitNumber, buildingAbbreviation, ...restFormData } = req.body;

    if (!restFormData.unitType || !restFormData.unitType.toString().trim()) {
      return sendError(res, "Unit Type is required", 400);
    }
    if (
      restFormData.floorNumber === undefined ||
      restFormData.floorNumber === null ||
      restFormData.floorNumber.toString().trim() === ""
    ) {
      return sendError(res, "Floor Number is required", 400);
    }

    const template = await FormTemplate.findOne({
      formType: "building",
      isActive: true,
    });
    if (template) {
      const templateErrors = validateAgainstTemplate(template, restFormData);
      if (templateErrors.length) {
        return sendError(res, templateErrors.join(", "), 400);
      }
    }

    let trimmedUnitNumber =
      unitNumber && unitNumber.toString().trim()
        ? unitNumber.toString().trim()
        : null;

    if (trimmedUnitNumber) {
      const existingUnit = await Building.findOne({
        parentBuilding: parent._id,
        unitNumber: trimmedUnitNumber,
      });
      if (existingUnit) {
        return sendError(
          res,
          `Unit "${trimmedUnitNumber}" already exists under this building`,
          409,
        );
      }
    } else {
      trimmedUnitNumber = await generateNextUnitNumber(parent._id);
    }

    const inheritedFormData = {
      address: parent.formData?.address || "",
      fullAddress: parent.formData?.fullAddress || "",
      city: parent.formData?.city || "",
      buildingType: parent.formData?.buildingType || "",
    };

    const unit = await Building.create({
      isMultiUnit: false,
      parentBuilding: parent._id,
      unitNumber: trimmedUnitNumber,
      buildingAbbreviation:
        (buildingAbbreviation && buildingAbbreviation.toString().trim()) ||
        `${parent.buildingAbbreviation || parent._id}-${trimmedUnitNumber}`,
      portfolio: parent.portfolio,
      formData: { ...inheritedFormData, ...restFormData },
      status: req.body.status || "vacant",
      createdBy: req.user._id,
    });

    await AuditService.logActivity({
      entityType: "building",
      entityId: unit._id,
      action: "created",
      actionDetails: `Unit ${unit.unitNumber} created under building ${
        parent.buildingAbbreviation || parent._id
      }`,
      performedBy: req.user._id,
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    return sendSuccess(res, "Unit created successfully", { unit }, 201);
  } catch (err) {
    if (err.name === "ValidationError") {
      return sendError(res, err.message, 400);
    }
    return sendError(res, err.message || "Failed to create unit", 500);
  }
};

/**
 * List all units attached to a top-level Multi-Unit Building.
 */
exports.getUnitsByBuilding = async (req, res) => {
  try {
    const { id: parentId } = req.params;

    const parent = await Building.findById(parentId);
    if (!parent) return sendError(res, "Building not found", 404);

    const units = await Building.find({ parentBuilding: parentId })
      .populate("createdBy", "preferredName email")
      .sort({ unitNumber: 1 })
      .lean();

    return sendSuccess(res, "Units fetched successfully", {
      units,
      total: units.length,
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch units", 500);
  }
};
