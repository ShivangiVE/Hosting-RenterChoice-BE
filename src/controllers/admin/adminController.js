const User = require("../../models/User");
const { sendSuccess, sendError } = require("../../utils/response");
const generateToken = require("../../utils/generateToken");

const INTERNAL_ROLES = [
  "OfficeAdmin",
  "AccountsTeam",
  "RepairsTeam",
  "LeaseTeam",
  "MarketingTeam",
  "LandlordsTeam",
  "InspectionClerk",
];

// Admin creates OfficeAdmin
exports.createOfficeAdmin = async (req, res) => {
  try {
    const { preferredName, email, password, role } = req.body;

    if (role !== "OfficeAdmin") {
      return sendError(res, "Role must be OfficeAdmin only", 400);
    }

    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) {
      return sendError(res, "User already exists", 409);
    }

    const user = await User.create({
      preferredName,
      email,
      password,
      role,
      createdBy: req.user.id,
    });

    return sendSuccess(
      res,
      "Office admin created successfully",
      {
        _id: user._id,
        preferredName: user.preferredName,
        email: user.email,
        role: user.role,
      },
      201
    );
  } catch (err) {
    return sendError(res, "Failed to create office admin", 500);
  }
};

// Admin creates Internal Users too
exports.createInternalUser = async (req, res) => {
  try {
    const { preferredName, email, password, role } = req.body;

    if (!INTERNAL_ROLES.includes(role)) {
      return sendError(res, "Invalid internal role", 400);
    }

    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) {
      return sendError(res, "User already exists", 409);
    }

    const user = await User.create({
      preferredName,
      email,
      password,
      role,
    });

    return sendSuccess(
      res,
      "Internal user created successfully",
      {
        _id: user._id,
        preferredName: user.preferredName,
        email: user.email,
        role: user.role,
      },
      201
    );
  } catch (err) {
    return sendError(res, "Failed to create internal user", 500);
  }
};

// Get All Users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    return sendSuccess(res, "Users retrieved successfully", { users });
  } catch (err) {
    return sendError(res, "Failed to retrieve users", 500);
  }
};

// Get all Office Admin
exports.getOfficeAdmins = async (req, res) => {
  try {
    const officeAdmins = await User.find({ role: "OfficeAdmin" }).select(
      "preferredName email"
    );
    return sendSuccess(res, "Office admins retrieved successfully", {
      officeAdmins,
    });
  } catch (err) {
    return sendError(res, "Failed to fetch office admins", 500);
  }
};

// Get Users as per office admin team
exports.getTeamsGroupedByOfficeAdmin = async (req, res) => {
  try {
    const officeAdmins = await User.find({ role: "OfficeAdmin" }).select(
      "_id preferredName email"
    );

    const result = [];

    for (const admin of officeAdmins) {
      const team = await User.find({
        createdBy: admin._id,
        role: { $in: INTERNAL_ROLES },
      }).select("preferredName email role");

      result.push({
        officeAdmin: {
          _id: admin._id,
          name: admin.preferredName,
          email: admin.email,
        },
        teamMembers: team,
      });
    }

    return sendSuccess(res, "Teams grouped successfully", { teams: result });
  } catch (error) {
    return sendError(res, "Failed to group teams", 500);
  }
};

// Impersonate an OfficeAdmin
exports.impersonateOfficeAdmin = async (req, res) => {
  try {
    const { officeAdminId } = req.params;

    const targetUser = await User.findById(officeAdminId);
    if (!targetUser || targetUser.role !== "OfficeAdmin") {
      return sendError(res, "Office admin not found", 404);
    }

    const token = generateToken(targetUser);

    return sendSuccess(res, "Impersonation successful", {
      token,
      user: {
        _id: targetUser._id,
        email: targetUser.email,
        preferredName: targetUser.preferredName,
        role: targetUser.role,
      },
    });
  } catch (error) {
    return sendError(res, "Impersonation failed", 500);
  }
};

exports.deleteUser = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    return sendSuccess(res, "User deleted successfully");
  } catch (err) {
    return sendError(res, "Failed to delete user", 500);
  }
};

exports.updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select("-password");

    if (!user) {
      return sendError(res, "User not found", 404);
    }

    return sendSuccess(res, "User role updated successfully", { user });
  } catch (err) {
    return sendError(res, "Failed to update user role", 500);
  }
};
