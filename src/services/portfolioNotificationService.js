const NOTIFICATION_TYPES = require("../constants/notificationTypes");
const User = require("../models/User");
const { createNotification } = require("./notificationService");

const EVENT_OWNER_LINKED = "PORTFOLIO_OWNER_LINKED";

async function getPortfolioOfficeRecipients(portfolio) {
  const creator = await User.findById(portfolio.createdBy)
    .select("team")
    .lean();

  if (creator?.team) {
    const officeAdmins = await User.find({
      team: creator.team,
      role: "OfficeAdmin",
      isActive: true,
    })
      .select("_id role")
      .lean();
    if (officeAdmins.length) return officeAdmins;
  }

  return User.find({ role: "Admin", isActive: true }).select("_id role").lean();
}

/** Tell the managing office that an owner linked themselves to a portfolio. */
exports.notifyOwnerLinkedPortfolio = async ({ portfolio, owner }) => {
  const recipients = await getPortfolioOfficeRecipients(portfolio);
  if (!recipients.length) return;

  const ownerName = owner.preferredName || owner.email;

  const results = await Promise.allSettled(
    recipients.map((u) =>
      createNotification({
        user: u._id,
        role: u.role,
        type: NOTIFICATION_TYPES.PORTFOLIO_OWNER_LINKED,
        title: "Owner Linked to Portfolio",
        message: `${ownerName} (${owner.email}) added portfolio "${portfolio.portfolioName}" to their account using the portfolio number.`,
        entityType: "Portfolio",
        entityId: portfolio._id,
        metadata: { ownerId: String(owner._id) },
      }),
    ),
  );

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(
        `[notifyOwnerLinkedPortfolio] Failed for user ${recipients[i]._id}:`,
        r.reason?.message,
      );
    }
  });
};
