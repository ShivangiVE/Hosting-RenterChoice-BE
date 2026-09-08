const NotificationDigestQueueItem = require("../models/NotificationDigestQueueItem");
const User = require("../models/User");
const { sendDigestEmail } = require("../services/notificationEmailService");
const { registerJob } = require("../jobs/registry");

const TIERS = [
  { frequency: "every15min", cron: "*/15 * * * *", label: "15-Minute" },
  { frequency: "every30min", cron: "*/30 * * * *", label: "30-Minute" },
  { frequency: "hourly", cron: "0 * * * *", label: "Hourly" },
  { frequency: "daily", cron: "0 7 * * *", label: "Daily" },
  { frequency: "weekly", cron: "0 7 * * 1", label: "Weekly" },
];

const runTier = async (frequency, label) => {
  const items = await NotificationDigestQueueItem.find({
    frequency,
    sentInDigestAt: null,
  });
  const byUser = items.reduce((acc, item) => {
    (acc[item.user] = acc[item.user] || []).push(item);
    return acc;
  }, {});

  for (const [userId, userItems] of Object.entries(byUser)) {
    try {
      const user = await User.findById(userId);
      if (user) await sendDigestEmail(user, userItems, label);
      await NotificationDigestQueueItem.updateMany(
        { _id: { $in: userItems.map((i) => i._id) } },
        { sentInDigestAt: new Date() },
      );
    } catch (err) {
      console.error(`[Digest] failed for user ${userId}:`, err.message);
    }
  }
};

TIERS.forEach(({ frequency, cron, label }) => {
  registerJob({
    name: `notificationDigest:${frequency}`,
    cronExpression: cron,
    task: () => runTier(frequency, label),
  });
});
