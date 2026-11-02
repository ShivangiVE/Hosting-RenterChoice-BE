const mongoose = require("mongoose");
const User = require("../models/User");
const UserStatusLog = require("../models/UserStatusLog");
const { sendSuccess, sendError } = require("./response");

/**
 * Activate / deactivate a user (shared by Master Admin + My Team).
 *
 * Body:
 *   password  (required) performer's own password — re-auth for a sensitive action
 *   reason    (optional) stored in the audit log
 *   isActive  (optional) the DESIRED status. When sent, the call is idempotent:
 *             a double-click or a stale screen can't flip the user back.
 *             When omitted it toggles (old behaviour → existing screens keep working).
 *
 * @param {Object} options
 * @param {Function} options.scopeCheck - async fn(targetUser, performer) => boolean
 *   Return true if the performer is allowed to change this target.
 */
exports.toggleUserStatus = async (req, res, options = {}) => {
  const { scopeCheck } = options;

  try {
    const { userId } = req.params;
    const { password, reason, isActive } = req.body;

    // 0. Bad id → 404 instead of a CastError 500
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendError(res, "User not found", 404);
    }

    if (isActive !== undefined && typeof isActive !== "boolean") {
      return sendError(res, "isActive must be true or false", 400);
    }

    // 1. Require password
    if (!password) {
      return sendError(res, "Password is required to perform this action", 400);
    }

    // 2. Verify performer's password
    const performer = await User.findById(req.user._id).select("+password");
    if (!performer) return sendError(res, "Unauthorized", 401);

    const isMatch = await performer.matchPassword(password);
    if (!isMatch) {
      return sendError(res, "Incorrect password. Action not permitted.", 403);
    }

    // 3. Find target user
    const targetUser = await User.findById(userId);
    if (!targetUser) return sendError(res, "User not found", 404);

    // 4. Prevent self-toggle
    if (targetUser._id.equals(performer._id)) {
      return sendError(res, "You cannot change your own status", 400);
    }

    // 5. Scope check (role-based authorization)
    if (scopeCheck) {
      const allowed = await scopeCheck(targetUser, performer);
      if (!allowed) {
        return sendError(res, "Not authorized to modify this user", 403);
      }
    }

    const previousStatus = targetUser.isActive !== false;
    const newStatus =
      typeof isActive === "boolean" ? isActive : !previousStatus;

    // 6. Already in the requested state → nothing to do (no log, no session kill)
    if (newStatus === previousStatus) {
      return sendSuccess(
        res,
        `User is already ${newStatus ? "active" : "inactive"}`,
        {
          userId: targetUser._id,
          isActive: newStatus,
          action: "unchanged",
        },
      );
    }

    // 7. Change status
    targetUser.isActive = newStatus;

    // 8. Invalidate sessions if deactivating
    if (!newStatus) {
      targetUser.internalWebSessionVersion += 1;
      targetUser.externalWebSessionVersion += 1;
    }

    await targetUser.save();

    // 9. Write audit log
    const action = newStatus ? "activated" : "deactivated";
    await UserStatusLog.create({
      targetUser: targetUser._id,
      performedBy: performer._id,
      performedByRole: performer.role,
      action,
      previousStatus,
      newStatus,
      reason: reason ? String(reason).trim().slice(0, 500) : null,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return sendSuccess(res, `User ${action} successfully`, {
      userId: targetUser._id,
      isActive: targetUser.isActive,
      action,
    });
  } catch (err) {
    console.error("toggleUserStatus error:", err);
    return sendError(res, "Failed to update user status", 500);
  }
};
