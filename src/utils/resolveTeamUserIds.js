const User = require("../models/User");

/**
 * Returns an array of user IDs that the requesting user is allowed to see data for.
 *
 * Admin          → null (no filter — sees everything)
 * BrokerageAdmin → all team members under their OfficeAdmins
 * OfficeAdmin    → themselves + their team members
 * Team member    → themselves + their siblings (same OfficeAdmin)
 */
const resolveTeamUserIds = async (reqUser) => {
  const { _id, role } = reqUser;

  // Admin sees everything — return null to signal "no user filter"
  if (role === "Admin") return null;

  if (role === "BrokerageAdmin") {
    // 1. Find all OfficeAdmins created by this BrokerageAdmin
    const officeAdmins = await User.find({
      role: "OfficeAdmin",
      createdBy: _id,
    }).select("_id");

    const officeAdminIds = officeAdmins.map((a) => a._id);

    // 2. Find all team members created by those OfficeAdmins
    const teamMembers = await User.find({
      createdBy: { $in: officeAdminIds },
    }).select("_id");

    // BrokerageAdmin can see: their OfficeAdmins + all team members under them
    return [...officeAdminIds, ...teamMembers.map((m) => m._id)];
  }

  if (role === "OfficeAdmin") {
    // OfficeAdmin sees: themselves + their team members
    const teamMembers = await User.find({
      createdBy: _id,
    }).select("_id");

    return [_id, ...teamMembers.map((m) => m._id)];
  }

  // Any team role (AccountsTeam, RepairsTeam, etc.)
  // Find their OfficeAdmin, then get all siblings
  const self = await User.findById(_id).select("createdBy");

  if (!self?.createdBy) {
    // Fallback: can only see their own data
    return [_id];
  }

  const officeAdminId = self.createdBy;

  const siblings = await User.find({
    createdBy: officeAdminId,
  }).select("_id");

  // Team member sees: themselves + all siblings + their OfficeAdmin
  return [_id, officeAdminId, ...siblings.map((s) => s._id)];
};

module.exports = resolveTeamUserIds;
