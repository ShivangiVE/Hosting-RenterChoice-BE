const User = require("../models/User");
const UserStatusLog = require("../models/UserStatusLog");
const { sendSuccess, sendError } = require("./response");

/**
 * @param {Object} options
 * @param {Function} options.scopeCheck - async fn(targetUser, performingUser) => boolean
 *   Return true if the performer is allowed to toggle this target.
 */
exports.toggleUserStatus = async (req, res, options = {}) => {
  const { scopeCheck } = options;

  try {
    const { userId } = req.params;
    const { password, reason } = req.body;

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
    if (targetUser._id.toString() === performer._id.toString()) {
      return sendError(res, "You cannot change your own status", 400);
    }

    // 5. Scope check (role-based authorization)
    if (scopeCheck) {
      const allowed = await scopeCheck(targetUser, performer);
      if (!allowed) {
        return sendError(res, "Not authorized to modify this user", 403);
      }
    }

    const previousStatus = targetUser.isActive;
    const newStatus = !previousStatus;

    // 6. Toggle status
    targetUser.isActive = newStatus;

    // 7. Invalidate sessions if deactivating
    if (!newStatus) {
      targetUser.internalWebSessionVersion += 1;
      targetUser.externalWebSessionVersion += 1;
    }

    await targetUser.save();

    // 8. Write audit log
    await UserStatusLog.create({
      targetUser: targetUser._id,
      performedBy: performer._id,
      performedByRole: performer.role,
      action: newStatus ? "activated" : "deactivated",
      previousStatus,
      newStatus,
      reason: reason || null,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return sendSuccess(
      res,
      `User ${newStatus ? "activated" : "deactivated"} successfully`,
      {
        userId: targetUser._id,
        isActive: targetUser.isActive,
        action: newStatus ? "activated" : "deactivated",
      },
    );
  } catch (err) {
    console.error("toggleUserStatus error:", err);
    return sendError(res, "Failed to update user status", 500);
  }
};
