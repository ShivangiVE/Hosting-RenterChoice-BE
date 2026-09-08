const { sendEmail } = require("./emailService");

const APP_NAME = "Renter's Choice";

const sendNotificationEmailNow = async (user, notification) => {
  if (!user?.email) return;

  const subject = notification.title || "New Notification";

  const text = `
Hi ${user.preferredName || user.firstName || "there"},

${notification.message}

Log in to ${APP_NAME} to view more details.
  `;

  const html = `
    <p>Hi ${user.preferredName || user.firstName || "there"},</p>
    <p>${notification.message}</p>
    <p>
      <a href="${process.env.CORS_ORIGIN}/notifications" style="color: white; background: #018898; padding: 10px 15px; border-radius: 4px; text-decoration: none;">
        View in ${APP_NAME}
      </a>
    </p>
  `;

  await sendEmail(user.email, subject, text, html);
};

// Fires from the digest cron jobs — bundles everything queued for one user in one tier
const sendDigestEmail = async (user, notifications, frequencyLabel) => {
  if (!user?.email || !notifications?.length) return;

  const subject = `Your ${frequencyLabel} Notification Summary (${notifications.length})`;

  const textLines = notifications
    .map((n, i) => `${i + 1}. ${n.message}`)
    .join("\n");
  const text = `
Hi ${user.preferredName || user.firstName || "there"},

Here is your ${frequencyLabel.toLowerCase()} summary of ${notifications.length} notification(s):

${textLines}

Log in to ${APP_NAME} to view more details.
  `;

  const htmlItems = notifications
    .map((n) => `<li style="margin-bottom: 8px;">${n.message}</li>`)
    .join("");
  const html = `
    <p>Hi ${user.preferredName || user.firstName || "there"},</p>
    <p>Here is your ${frequencyLabel.toLowerCase()} summary of ${notifications.length} notification(s):</p>
    <ul>${htmlItems}</ul>
    <p>
      <a href="${process.env.CORS_ORIGIN}/notifications" style="color: white; background: #007bff; padding: 10px 15px; border-radius: 4px; text-decoration: none;">
        View in ${APP_NAME}
      </a>
    </p>
  `;

  await sendEmail(user.email, subject, text, html);
};

module.exports = { sendNotificationEmailNow, sendDigestEmail };
