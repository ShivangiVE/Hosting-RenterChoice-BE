const User = require("../../models/User");
const { sendError, sendSuccess } = require("../../utils/response");
const generateToken = require("../../utils/generateToken");
const { toggleUserStatus } = require("../../utils/toggleUserStatus");
const { TEAM_ROLES, BROKERAGE_STAFF_ROLES } = require("../../constants/roles");
const {
  createUserAccount,
  toCreatedUser,
} = require("../../utils/createUserAccount");

const CREATABLE_BROKERAGE_STAFF_ROLES = BROKERAGE_STAFF_ROLES;

const myOfficeAdminsFilter = (brokerageAdminId) => ({
  role: "OfficeAdmin",
  $or: [{ createdBy: brokerageAdminId }, { managedBy: brokerageAdminId }],
});


const withTeamName = (admin) => ({
  _id: admin._id,
  preferredName: admin.preferredName,
  email: admin.email,
  isActive: admin.isActive,
  createdAt: admin.createdAt,
  teamName: admin.team?.businessLegalName || "",
});

// BrokerageAdmin creates OfficeAdmins
exports.createOfficeAdmin = async (req, res) => {
  try {
    const { user, error, status } = await createUserAccount(req.body, {
      role: "OfficeAdmin",
      createdBy: req.user._id,
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

// BrokerageAdmin creates BrokerageAccounts or BrokerageUser
exports.createBrokerageStaff = async (req, res) => {
  try {
    const { role } = req.body;
    if (!CREATABLE_BROKERAGE_STAFF_ROLES.includes(role)) {
      return sendError(
        res,
        `Invalid role. Must be one of: ${CREATABLE_BROKERAGE_STAFF_ROLES.join(", ")}`,
        400,
      );
    }

    const { user, error, status } = await createUserAccount(req.body, {
      role,
      createdBy: req.user._id,
    });
    if (error) return sendError(res, error, status);

    return sendSuccess(
      res,
      `${role} created successfully`,
      toCreatedUser(user),
      201,
    );
  } catch (err) {
    console.error("createBrokerageStaff error:", err);
    return sendError(res, "Failed to create brokerage staff", 500);
  }
};

// BrokerageAdmin gets their own OfficeAdmins
exports.getMyOfficeAdmins = async (req, res) => {
  try {
    const admins = await User.find(myOfficeAdminsFilter(req.user._id))
      .select("preferredName email isActive createdAt team")
      .populate("team", "businessLegalName")
      .lean();

    const officeAdmins = admins
      .map(withTeamName)
      .sort((a, b) =>
        (a.teamName || a.preferredName).localeCompare(
          b.teamName || b.preferredName,
        ),
      );

    return sendSuccess(res, "Office admins retrieved", { officeAdmins });
  } catch (err) {
    return sendError(res, "Failed to fetch office admins", 500);
  }
};

// BrokerageAdmin lists their own BrokerageAccounts / BrokerageUser staff
exports.getMyBrokerageStaff = async (req, res) => {
  try {
    const staff = await User.find({
      role: { $in: CREATABLE_BROKERAGE_STAFF_ROLES },
      createdBy: req.user._id,
    }).select("preferredName email role isActive createdAt");

    return sendSuccess(res, "Brokerage staff retrieved", { staff });
  } catch (err) {
    return sendError(res, "Failed to fetch brokerage staff", 500);
  }
};

// Get team members under a specific OfficeAdmin (scoped to this BrokerageAdmin)
exports.getOfficeAdminTeam = async (req, res) => {
  try {
    const { officeAdminId } = req.params;

    // Verify this OfficeAdmin belongs to this BrokerageAdmin
    const officeAdmin = await User.findOne({
      _id: officeAdminId,
      role: "OfficeAdmin",
      createdBy: req.user._id,
    });

    if (!officeAdmin) return sendError(res, "Office admin not found", 404);

    const teamMembers = await User.find({
      createdBy: officeAdminId,
      role: { $in: TEAM_ROLES },
    }).select("preferredName email role isActive createdAt");

    return sendSuccess(res, "Team members retrieved", { teamMembers });
  } catch (err) {
    return sendError(res, "Failed to fetch team members", 500);
  }
};

// BrokerageAdmin gets teams grouped under their OfficeAdmins
exports.getMyTeamsGrouped = async (req, res) => {
  try {
    const officeAdmins = await User.find({
      role: "OfficeAdmin",
      createdBy: req.user._id,
    }).select("_id preferredName email");

    const result = await Promise.all(
      officeAdmins.map(async (admin) => {
        const team = await User.find({
          createdBy: admin._id,
          role: { $in: TEAM_ROLES },
        }).select("preferredName email role isActive");

        return {
          officeAdmin: {
            _id: admin._id,
            name: admin.preferredName,
            email: admin.email,
          },
          teamMembers: team,
        };
      }),
    );

    return sendSuccess(res, "Teams grouped successfully", { teams: result });
  } catch (err) {
    return sendError(res, "Failed to group teams", 500);
  }
};

// BrokerageAdmin impersonates one of their OfficeAdmins
exports.impersonateOfficeAdmin = async (req, res) => {
  try {
    const target = await User.findOne({
      _id: req.params.officeAdminId,
      ...myOfficeAdminsFilter(req.user._id),
    });

    if (!target) return sendError(res, "Office admin not found", 404);

    const token = generateToken({
      user: target,
      platform: "impersonate",
      portal: "internal",
      impersonator: req.user,
    });

    return sendSuccess(res, "Impersonation successful", {
      token,
      user: {
        _id: target._id,
        email: target.email,
        preferredName: target.preferredName,
        role: target.role,
      },
    });
  } catch (err) {
    return sendError(res, "Impersonation failed", 500);
  }
};

// Activating and Deactivating the user.
exports.toggleUserStatus = (req, res) =>
  toggleUserStatus(req, res, {
    scopeCheck: async (targetUser, performer) => {
      // Can toggle OfficeAdmins they created
      const me = performer._id.toString();

      // Can toggle their OfficeAdmins (created by them or managed by them)
      if (targetUser.role === "OfficeAdmin")
        return (
          targetUser.createdBy?.toString() === me ||
          targetUser.managedBy?.toString() === me
        );

      // Can toggle team members under their OfficeAdmins
      if (TEAM_ROLES.includes(targetUser.role)) {
        const officeAdmin = await User.findOne({
          _id: targetUser.createdBy,
          ...myOfficeAdminsFilter(performer._id),
        });
        return !!officeAdmin;
      }

      return false;
    },
  });

// BrokerageAdmin toggles active/inactive for their own staff
exports.toggleBrokerageStaffStatus = (req, res) =>
  toggleUserStatus(req, res, {
    scopeCheck: async (targetUser, performer) =>
      CREATABLE_BROKERAGE_STAFF_ROLES.includes(targetUser.role) &&
      targetUser.createdBy?.toString() === performer._id.toString(),
  });

// BrokerageAdmin deletes an OfficeAdmin they own
exports.deleteOfficeAdmin = async (req, res) => {
  try {
    const target = await User.findOne({
      _id: req.params.id,
      role: "OfficeAdmin",
      createdBy: req.user._id,
    });

    if (!target) return sendError(res, "Office admin not found", 404);

    await User.findByIdAndDelete(req.params.id);
    return sendSuccess(res, "Office admin deleted successfully");
  } catch (err) {
    return sendError(res, "Failed to delete office admin", 500);
  }
};

// BrokerageAdmin deletes their own staff
exports.deleteBrokerageStaff = async (req, res) => {
  try {
    const target = await User.findOne({
      _id: req.params.id,
      role: { $in: CREATABLE_BROKERAGE_STAFF_ROLES },
      createdBy: req.user._id,
    });

    if (!target) return sendError(res, "Brokerage staff not found", 404);

    await User.findByIdAndDelete(req.params.id);
    return sendSuccess(res, "Brokerage staff deleted successfully");
  } catch (err) {
    return sendError(res, "Failed to delete brokerage staff", 500);
  }
};

// BrokerageAdmin deletes a team member under their OfficeAdmins
exports.deleteTeamMember = async (req, res) => {
  try {
    // Find the user and verify they're a team member
    const member = await User.findOne({
      _id: req.params.memberId,
      role: { $in: TEAM_ROLES },
    });

    if (!member) return sendError(res, "Team member not found", 404);

    // Verify the member's OfficeAdmin belongs to this BrokerageAdmin
    const officeAdmin = await User.findOne({
      _id: member.createdBy,
      role: "OfficeAdmin",
      createdBy: req.user._id, // scope check
    });

    if (!officeAdmin)
      return sendError(res, "Not authorized to delete this user", 403);

    await User.findByIdAndDelete(req.params.memberId);
    return sendSuccess(res, "Team member deleted successfully");
  } catch (err) {
    return sendError(res, "Failed to delete team member", 500);
  }
};
