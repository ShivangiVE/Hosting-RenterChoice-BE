const mongoose = require("mongoose");
const User = require("../models/User");
const AuditService = require("../services/auditService");
const { sendSuccess, sendError } = require("./response");
const { setLpmStatus } = require("./lpm");
const { LPM_ELIGIBLE_ROLES } = require("../constants/roles");

const NAME_MAX = 100;
const TARGET_FIELDS =
  "preferredName email role isActive isLPM createdBy managedBy team";

const cleanName = (value) => {
  if (typeof value !== "string") return { error: "Name must be text" };
  const name = value.replace(/\s+/g, " ").trim();
  if (!name) return { error: "Name is required" };
  if (name.length > NAME_MAX) {
    return { error: `Name can be at most ${NAME_MAX} characters` };
  }
  if (/[\u0000-\u001F\u007F<>]/.test(name)) {
    return { error: "Name contains invalid characters" };
  }
  return { value: name };
};

// The server decides what the popup may edit
const toProfile = (user, canEditName) => ({
  _id: user._id,
  preferredName: user.preferredName || "",
  email: user.email,
  role: user.role,
  isActive: user.isActive !== false,
  isLPM: Boolean(user.isLPM),
  permissions: {
    canEditName,
    canEditLpm: LPM_ELIGIBLE_ROLES.includes(user.role),
  },
});

// Same 404 for "doesn't exist" and "not in your scope"
const findTarget = async (req, scopeCheck) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return null;
  const target = await User.findById(id).select(TARGET_FIELDS);
  if (!target) return null;
  return (await scopeCheck(target, req.user)) ? target : null;
};

const buildTeamUserProfileHandlers = ({ scopeCheck, canEditName = false }) => ({
  // GET /users/:id/profile
  getProfile: async (req, res) => {
    try {
      const target = await findTarget(req, scopeCheck);
      if (!target) return sendError(res, "User not found", 404);
      return sendSuccess(res, "User retrieved", toProfile(target, canEditName));
    } catch (err) {
      console.error("getTeamUserProfile error:", err);
      return sendError(res, "Failed to load user", 500);
    }
  },

  // PATCH /users/:id/profile   body: { preferredName?, isLPM? }
  updateProfile: async (req, res) => {
    try {
      const { preferredName, isLPM } = req.body || {};
      if (preferredName === undefined && isLPM === undefined) {
        return sendError(res, "Nothing to update", 400);
      }

      const target = await findTarget(req, scopeCheck);
      if (!target) return sendError(res, "User not found", 404);

      // Validate everything before writing anything
      let nextName;
      if (preferredName !== undefined) {
        if (!canEditName) {
          return sendError(res, "You can't change this user's name", 403);
        }
        const name = cleanName(preferredName);
        if (name.error) return sendError(res, name.error, 400);
        nextName = name.value;
      }

      if (isLPM !== undefined) {
        if (typeof isLPM !== "boolean") {
          return sendError(res, "isLPM must be true or false", 400);
        }
        if (!LPM_ELIGIBLE_ROLES.includes(target.role)) {
          return sendError(
            res,
            "Only Team Admins and internal team users can be Licensed Property Managers",
            400,
          );
        }
      }

      const oldName = target.preferredName;
      if (nextName !== undefined && nextName !== oldName) {
        await User.updateOne(
          { _id: target._id },
          { $set: { preferredName: nextName } },
        );
        target.preferredName = nextName;

        AuditService.logActivity({
          entityType: "user",
          entityId: target._id,
          action: "updated",
          actionDetails: `Name changed for ${target.email}`,
          changes: [
            { field: "preferredName", oldValue: oldName, newValue: nextName },
          ],
          performedBy: req.user._id,
          ipAddress: req.ip,
          userAgent: req.get("User-Agent"),
        }).catch((e) => console.error("Name change audit failed:", e));
      }

      // Same LPM writer + audit the Team page already uses
      if (isLPM !== undefined && isLPM !== Boolean(target.isLPM)) {
        const changed = await setLpmStatus({
          user: target,
          isLPM,
          performer: req.user,
          req,
        });
        if (changed) target.isLPM = isLPM;
      }

      return sendSuccess(
        res,
        "User updated successfully",
        toProfile(target, canEditName),
      );
    } catch (err) {
      console.error("updateTeamUserProfile error:", err);
      return sendError(res, "Failed to update user", 500);
    }
  },
});

module.exports = { buildTeamUserProfileHandlers };
