const mongoose = require("mongoose");
const User = require("../../models/User");
const Team = require("../../models/Team");
const AuditService = require("../../services/auditService");
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
const IMPERSONATABLE_ROLES = ["OfficeAdmin", "BrokerageAdmin"];

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

// "Login As" list grouped the way the business is organised:
//   Brokerage (franchise) → its Brokerage Admin
//                         → each Team (expansion) → its Team Admin
//   others → admins not linked to an active team (legacy accounts)
// 3 queries in total, grouped in memory.
const toTarget = (u) =>
  u?._id
    ? {
        _id: u._id,
        preferredName: u.preferredName,
        email: u.email,
        role: u.role,
        isActive: u.isActive !== false,
      }
    : null;

exports.getLoginAsTargets = async (req, res) => {
  try {
    const adminFields = "preferredName email role isActive";
    const [franchises, expansions] = await Promise.all([
      Team.find({ teamType: "franchise", status: "Active" })
        .select("businessLegalName uniqueIdNumber companyCity admin")
        .populate("admin", adminFields)
        .sort({ businessLegalName: 1 })
        .lean(),
      Team.find({ teamType: "expansion", status: "Active" })
        .select(
          "businessLegalName uniqueIdNumber companyCity admin parentBrokerage",
        )
        .populate("admin", adminFields)
        .sort({ businessLegalName: 1 })
        .lean(),
    ]);

    const teamsByBrokerage = new Map(
      franchises.map((f) => [String(f._id), []]),
    );
    const orphanTeamAdmins = []; // team whose brokerage is not active
    expansions.forEach((t) => {
      const team = {
        _id: t._id,
        name: t.businessLegalName,
        uniqueIdNumber: t.uniqueIdNumber || "",
        city: t.companyCity || "",
        admin: toTarget(t.admin),
      };
      const list = teamsByBrokerage.get(String(t.parentBrokerage));
      if (list) list.push(team);
      else if (team.admin)
        orphanTeamAdmins.push({ ...team.admin, teamName: team.name });
    });

    const brokerages = franchises.map((f) => ({
      _id: f._id,
      name: f.businessLegalName,
      uniqueIdNumber: f.uniqueIdNumber || "",
      city: f.companyCity || "",
      admin: toTarget(f.admin),
      teams: teamsByBrokerage.get(String(f._id)) || [],
    }));

    // Admins that are not the admin of any active team
    const linkedIds = [...franchises, ...expansions]
      .map((t) => t.admin?._id)
      .filter(Boolean);
    const unlinked = await User.find({
      role: { $in: IMPERSONATABLE_ROLES },
      _id: { $nin: linkedIds },
    })
      .select(adminFields)
      .sort({ preferredName: 1 })
      .lean();

    return sendSuccess(res, "Login-as targets fetched", {
      brokerages,
      others: [...orphanTeamAdmins, ...unlinked.map(toTarget)],
    });
  } catch (err) {
    console.error("getLoginAsTargets failed:", err);
    return sendError(res, "Failed to load Login As list", 500);
  }
};

// POST /api/admin/impersonate/:officeAdminId  (Master Admin)
exports.impersonateOfficeAdmin = async (req, res) => {
  try {
    const { officeAdminId } = req.params;
    if (!mongoose.isValidObjectId(officeAdminId)) {
      return sendError(res, "User not found", 404);
    }

    const targetUser = await User.findById(officeAdminId);
    if (!targetUser || !IMPERSONATABLE_ROLES.includes(targetUser.role)) {
      return sendError(res, "User not found", 404);
    }
    if (targetUser.isActive === false) {
      return sendError(
        res,
        "This account is deactivated. Activate it before using Login As.",
        403,
      );
    }

    const token = generateToken({
      user: targetUser,
      platform: "impersonate",
      portal: "internal",
      impersonator: req.user,
    });

    // Audit trail — never block the login if logging fails
    AuditService.logActivity({
      module: "User",
      action: "IMPERSONATE",
      entityId: targetUser._id,
      userId: req.user?._id,
      description: `Master Admin logged in as ${targetUser.role} ${targetUser.email}`,
    }).catch((e) => console.error("Impersonation audit log failed:", e));

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
