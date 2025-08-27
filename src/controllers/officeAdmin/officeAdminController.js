const User = require("../../models/User");
const { sendSuccess, sendError } = require("../../utils/response");

const INTERNAL_ROLES = [
  "AccountsTeam",
  "RepairsTeam",
  "LeaseTeam",
  "MarketingTeam",
  "LandlordsTeam",
  "InspectionClerk",
];

// OfficeAdmin creates internal team users
exports.createInternalUser = async (req, res) => {
  try {
    const { preferredName, email, password, role } = req.body;

    if (!INTERNAL_ROLES.includes(role)) {
      return sendError(res, "Invalid role for internal creation", 400);
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return sendError(res, "User already exists", 409);
    }

    const newUser = await User.create({
      preferredName,
      email,
      password,
      role,
      createdBy: req.user._id,
    });

    return sendSuccess(
      res,
      "Internal user created successfully",
      {
        _id: newUser._id,
        preferredName: newUser.preferredName,
        email: newUser.email,
        role: newUser.role,
      },
      201
    );
  } catch (err) {
    return sendError(res, "Failed to create internal user", 500);
  }
};

// OfficeAdmin can list all team users
exports.getInternalUsers = async (req, res) => {
  try {
    const filter = {
      role: { $in: INTERNAL_ROLES },
    };

    if (req.query.createdBy) {
      filter.createdBy = req.query.createdBy;
    }

    const users = await User.find(filter).select("-password");
    return sendSuccess(res, "Internal users retrieved successfully", { users });
  } catch (err) {
    return sendError(res, "Failed to retrieve internal users", 500);
  }
};

// OfficeAdmin can delete internal user
exports.deleteInternalUser = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    return sendSuccess(res, "Internal user deleted successfully");
  } catch (err) {
    return sendError(res, "Failed to delete internal user", 500);
  }
};

// OfficeAdmin can update internal user role
exports.updateInternalUserRole = async (req, res) => {
  try {
    const { role } = req.body;

    if (!INTERNAL_ROLES.includes(role)) {
      return sendError(res, "Invalid role", 400);
    }

    const updated = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select("-password");

    if (!updated) {
      return sendError(res, "User not found", 404);
    }

    return sendSuccess(res, "Internal user role updated successfully", {
      user: updated,
    });
  } catch (err) {
    return sendError(res, "Failed to update internal user role", 500);
  }
};
