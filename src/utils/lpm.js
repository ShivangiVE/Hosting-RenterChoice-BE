const User = require("../models/User");
const AuditService = require("../services/auditService");
const { TEAM_ROLES } = require("../constants/roles");

/** Roles allowed to change the LPM flag (per spec: Team Admin + Master Admin) */
const LPM_MANAGER_ROLES = ["Admin", "OfficeAdmin"];

/** Only internal team members can be LPMs */
const canBeLpm = (role) => TEAM_ROLES.includes(role);

/**
 * Validates `isLPM` from the request body for a given role.
 * Returns { value } (undefined = not sent) or { error }.
 */
const resolveLpmFlag = (raw, role) => {
  if (raw === undefined) return { value: undefined };
  const value =
    raw === true || raw === "true"
      ? true
      : raw === false || raw === "false"
        ? false
        : null;
  if (value === null) return { error: "isLPM must be true or false" };
  if (value && !canBeLpm(role))
    return { error: "Only internal team members can be marked as LPM" };
  return { value };
};

/**
 * THE single place that changes LPM status.
 * (If the client later wants Brokerage Admin approval, only this changes.)
 */
async function setLpmStatus({ user, isLPM, performer, req }) {
  if (Boolean(user.isLPM) === isLPM) return false; // no change

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        isLPM,
        lpmUpdatedAt: new Date(),
        lpmUpdatedBy: performer._id,
      },
    },
  );

  // Audit — never fail the request because of logging
  AuditService.logActivity({
    entityType: "user",
    entityId: user._id,
    action: "updated",
    actionDetails: `LPM status ${isLPM ? "enabled" : "removed"} for ${user.email}`,
    changes: [
      { field: "isLPM", oldValue: Boolean(user.isLPM), newValue: isLPM },
    ],
    performedBy: performer._id,
    ipAddress: req?.ip,
    userAgent: req?.get?.("User-Agent"),
  }).catch((e) => console.error("LPM audit failed:", e));

  return true;
}

module.exports = {
  LPM_MANAGER_ROLES,
  canBeLpm,
  resolveLpmFlag,
  setLpmStatus,
};
