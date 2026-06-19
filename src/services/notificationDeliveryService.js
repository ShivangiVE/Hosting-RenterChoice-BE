const { getIO } = require("../../socket");

/**
 * Delivery channel router.
 * Socket.io is live now. Email/push slots are ready to plug in.
 */
async function deliverNotification(notification) {
  await Promise.allSettled([
    deliverSocket(notification),
    // deliverEmail(notification),   ← plug in when ready
    // deliverPush(notification),    ← plug in when ready
  ]);
}

async function deliverSocket(notification) {
  try {
    getIO()
      .to(`user:${notification.user.toString()}`)
      .emit("notification:new", { notification });
  } catch (err) {
    // Socket not initialized (e.g. during tests) — non-fatal
    console.warn("[NotificationDelivery] Socket emit skipped:", err.message);
  }
}

// async function deliverEmail(notification) { ... }
// async function deliverPush(notification)  { ... }

module.exports = { deliverNotification };
