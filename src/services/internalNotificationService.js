const NOTIFICATION_EVENTS = require("../constants/notificationEvents");
const User = require("../models/User");
const { createNotification } = require("./notificationService");

exports.notifyInternalUsers = async ({
  eventType,
  title,
  message,
  entityType,
  entityId,
  metadata = {},
}) => {
  const config = NOTIFICATION_EVENTS[eventType];
  if (!config?.roles?.length) {
    console.warn(
      `[notifyInternalUsers] No config found for eventType: ${eventType}`,
    );
    return;
  }

  const roles = config.roles;

  // ── Fetch target users ────────────────────────────────────────────────────
  // Remove isActive filter — use your actual User model's status field,
  // or omit it entirely and just filter by role
  const users = await User.find({
    role: { $in: roles },
    // status: { $ne: "inactive" }, // ← uncomment and adjust if your model has this
  }).select("_id role");

  if (!users.length) {
    console.warn(
      `[notifyInternalUsers] No users found for roles: ${roles.join(", ")}`,
    );
    return;
  }

  console.log(
    `[notifyInternalUsers] Sending "${eventType}" to ${users.length} users`,
  );

  // ── Fan-out notifications ─────────────────────────────────────────────────
  const results = await Promise.allSettled(
    users.map((user) =>
      createNotification({
        user: user._id,
        role: user.role,
        type: eventType,
        title,
        message,
        entityType,
        entityId,
        metadata,
      }),
    ),
  );

  // ── Log any individual failures ───────────────────────────────────────────
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(
        `[notifyInternalUsers] Failed for user ${users[i]._id} (${users[i].role}):`,
        result.reason?.message,
      );
    }
  });
};
