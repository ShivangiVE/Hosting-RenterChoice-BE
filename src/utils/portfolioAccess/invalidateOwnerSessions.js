const User = require("../../models/User");
const Portfolio = require("../../models/Portfolio");

/**
 * Bumps externalWebSessionVersion for owners who, after a deactivation,
 * have zero Active portfolios left. Assumes your external auth middleware
 * compares the JWT's session-version claim against user.externalWebSessionVersion
 * (the same field/pattern your User model already has for force-logout) —
 * confirm that check exists in authMiddleware; if it doesn't yet, this bump
 * is currently inert and you'll want to add it (standard "invalidate all
 * outstanding tokens" pattern).
 */
async function invalidateSessionsForOwnersWithNoActivePortfolio(ownerIds) {
  if (!ownerIds.length) return;

  const stillActiveOwnerIds = await Portfolio.distinct("owners", {
    owners: { $in: ownerIds },
    status: "Active",
  });
  const stillActive = new Set(stillActiveOwnerIds.map(String));
  const toLockOut = ownerIds.filter((id) => !stillActive.has(id));

  if (toLockOut.length) {
    await User.updateMany(
      { _id: { $in: toLockOut } },
      { $inc: { externalWebSessionVersion: 1 } },
    );
  }
}

module.exports = { invalidateSessionsForOwnersWithNoActivePortfolio };
