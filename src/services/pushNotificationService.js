const { getMessaging } = require("firebase-admin/messaging");
const PushToken = require("../models/PushToken");
const { isFirebaseReady } = require("../config/firebase");

// FCM error codes that mean "this token will never work again" — the app
// was uninstalled, the browser revoked notification permission, the token
// was rotated, etc. Anything else (quota, network, server errors) is
// treated as temporary and the token is kept.
const DEAD_TOKEN_ERRORS = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

// FCM requires every value in the `data` payload to be a string.
const stringifyData = (data = {}) =>
  Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );

/**
 * Send a push notification to every registered device (web + Android + iOS)
 * belonging to one user.
 *
 * Safe to call for any user: if push isn't configured on this server, or
 * the user has no registered devices, it's a silent no-op.
 *
 * @param {ObjectId|string} userId
 * @param {object}  payload
 * @param {string}  payload.title
 * @param {string}  payload.body
 * @param {object}  [payload.data]  Extra key/values for the app to act on
 *                                  when the push is tapped (notificationId,
 *                                  type, entityType, entityId, ...).
 * @param {string}  [payload.link]  Web only — absolute HTTPS URL to open on
 *                                  click. Optional: the web service worker
 *                                  handles clicks itself.
 * @returns {Promise<{sent:number, failed:number, removed:number}>}
 */
const sendPushToUser = async (
  userId,
  { title, body, data = {}, link } = {},
) => {
  if (!isFirebaseReady()) return { sent: 0, failed: 0, removed: 0 };

  const tokenDocs = await PushToken.find({ user: userId }).select("token");
  if (!tokenDocs.length) return { sent: 0, failed: 0, removed: 0 };

  const tokens = tokenDocs.map((t) => t.token);

  const message = {
    tokens,
    notification: { title, body },
    data: stringifyData(data),

    // Android: high priority so it's delivered promptly even in Doze mode.
    android: {
      priority: "high",
      notification: { sound: "default" },
    },

    // iOS: play the default sound.
    apns: {
      payload: {
        aps: { sound: "default" },
      },
    },

    ...(link && {
      webpush: {
        fcmOptions: { link },
      },
    }),
  };

  const response = await getMessaging().sendEachForMulticast(message);

  const deadTokens = [];
  response.responses.forEach((res, idx) => {
    if (!res.success && DEAD_TOKEN_ERRORS.has(res.error?.code)) {
      deadTokens.push(tokens[idx]);
    }
  });

  if (deadTokens.length) {
    await PushToken.deleteMany({ token: { $in: deadTokens } });
  }

  const liveTokens = tokens.filter((t) => !deadTokens.includes(t));
  if (liveTokens.length) {
    await PushToken.updateMany(
      { token: { $in: liveTokens } },
      { $set: { lastUsedAt: new Date() } },
    );
  }

  return {
    sent: response.successCount,
    failed: response.failureCount,
    removed: deadTokens.length,
  };
};

module.exports = { sendPushToUser };
