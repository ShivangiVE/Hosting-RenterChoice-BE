const User = require("../../models/User");
const { sendSuccess, sendError } = require("../../utils/response");
const generateToken = require("../../utils/generateToken");
const { toggleUserStatus } = require("../../utils/toggleUserStatus");
const { TEAM_ROLES } = require("../../constants/roles");
const UserStatusLog = require("../../models/UserStatusLog");
const {
  createUserAccount,
  toCreatedUser,
} = require("../../utils/createUserAccount");

const INTERNAL_ROLES = ["OfficeAdmin", ...TEAM_ROLES];

exports.createBrokerageAdmin = async (req, res) => {
  try {
    const { user, error, status } = await createUserAccount(req.body, {
      role: "BrokerageAdmin",
      createdBy: req.user.id,
    });
    if (error) return sendError(res, error, status);

    return sendSuccess(
      res,
      "Brokerage admin created successfully",
      toCreatedUser(user),
      201,
    );
  } catch (err) {
    console.error("createBrokerageAdmin error:", err);
    return sendError(res, "Failed to create brokerage admin", 500);
  }
};

// Add to getBrokerageAdmins
exports.getBrokerageAdmins = async (req, res) => {
  try {
    const brokerageAdmins = await User.find({ role: "BrokerageAdmin" }).select(
      "preferredName email isActive createdAt",
    );
    return sendSuccess(res, "Brokerage admins retrieved", { brokerageAdmins });
  } catch (err) {
    return sendError(res, "Failed to fetch brokerage admins", 500);
  }
};

// Admin creates OfficeAdmin
exports.createOfficeAdmin = async (req, res) => {
  try {
    if (req.body.role !== "OfficeAdmin") {
      return sendError(res, "Role must be OfficeAdmin only", 400);
    }

    const { user, error, status } = await createUserAccount(req.body, {
      role: "OfficeAdmin",
      createdBy: req.user.id,
    });
    if (error) return sendError(res, error, status);

    return sendSuccess(
      res,
      "Office admin created successfully",
      toCreatedUser(user),
      201,
    );
  } catch (err) {
    console.error("createOfficeAdmin error:", err);
    return sendError(res, "Failed to create office admin", 500);
  }
};

// Admin creates Internal Users too
exports.createInternalUser = async (req, res) => {
  try {
    const { role } = req.body;
    if (!INTERNAL_ROLES.includes(role)) {
      return sendError(res, "Invalid internal role", 400);
    }

    const { user, error, status } = await createUserAccount(req.body, { role });
    if (error) return sendError(res, error, status);

    return sendSuccess(
      res,
      "Internal user created successfully",
      toCreatedUser(user),
      201,
    );
  } catch (err) {
    console.error("createInternalUser error:", err);
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
    const admins = await User.find({ role: "OfficeAdmin" })
      .select("preferredName email team")
      .populate("team", "businessLegalName")
      .lean();


    const officeAdmins = admins
      .map((a) => ({
        _id: a._id,
        preferredName: a.preferredName,
        email: a.email,
        teamName: a.team?.businessLegalName || "",
      }))
      .sort((a, b) =>
        (a.teamName || a.preferredName).localeCompare(
          b.teamName || b.preferredName,
        ),
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
      "_id preferredName email",
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

    const token = generateToken({
      user: targetUser,
      platform: "impersonate",
      portal: "internal",
      impersonator: req.user,
    });

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

// Activating and Deactivating the user.
exports.toggleUserStatus = (req, res) =>
  toggleUserStatus(req, res, {
    scopeCheck: async (targetUser, performer) => {
      // Admin cannot toggle another Admin
      return targetUser.role !== "Admin";
    },
  });

exports.getUserStatusLogs = async (req, res) => {
  try {
    const { userId } = req.params;
    const logs = await UserStatusLog.find({ targetUser: userId })
      .populate("performedBy", "preferredName email role")
      .populate("targetUser", "preferredName email role")
      .sort({ createdAt: -1 })
      .limit(50);

    return sendSuccess(res, "Status logs retrieved", { logs });
  } catch (err) {
    return sendError(res, "Failed to fetch logs", 500);
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
      { new: true },
    ).select("-password");

    if (!user) {
      return sendError(res, "User not found", 404);
    }

    return sendSuccess(res, "User role updated successfully", { user });
  } catch (err) {
    return sendError(res, "Failed to update user role", 500);
  }
};
