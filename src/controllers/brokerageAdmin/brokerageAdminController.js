const User = require("../../models/User");
const { sendError, sendSuccess } = require("../../utils/response");
const generateToken = require("../../utils/generateToken");

// BrokerageAdmin creates OfficeAdmins
exports.createOfficeAdmin = async (req, res) => {
  try {
    const { preferredName, email, password } = req.body;

    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) return sendError(res, "User already exists", 409);

    const user = await User.create({
      preferredName,
      email,
      password,
      role: "OfficeAdmin",
      createdBy: req.user._id, // links OfficeAdmin to this BrokerageAdmin
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
      201,
    );
  } catch (err) {
    return sendError(res, "Failed to create office admin", 500);
  }
};

// BrokerageAdmin gets their own OfficeAdmins
exports.getMyOfficeAdmins = async (req, res) => {
  try {
    const officeAdmins = await User.find({
      role: "OfficeAdmin",
      createdBy: req.user._id,
    }).select("preferredName email isActive createdAt");

    return sendSuccess(res, "Office admins retrieved", { officeAdmins });
  } catch (err) {
    return sendError(res, "Failed to fetch office admins", 500);
  }
};

// Get team members under a specific OfficeAdmin (scoped to this BrokerageAdmin)
exports.getOfficeAdminTeam = async (req, res) => {
  try {
    const { TEAM_ROLES } = require("../../constants/roles");
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

// Get team members under a specific OfficeAdmin (scoped to this BrokerageAdmin)
exports.getOfficeAdminTeam = async (req, res) => {
  try {
    const { TEAM_ROLES } = require("../../constants/roles");
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
    const { TEAM_ROLES } = require("../../constants/roles");

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
      role: "OfficeAdmin",
      createdBy: req.user._id, // scoped — can only impersonate own OAs
    });

    if (!target) return sendError(res, "Office admin not found", 404);

    const token = generateToken({
      user: target,
      platform: "impersonate",
      portal: "internal",
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

// BrokerageAdmin deletes a team member under their OfficeAdmins
exports.deleteTeamMember = async (req, res) => {
  try {
    const { TEAM_ROLES } = require("../../constants/roles");

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
