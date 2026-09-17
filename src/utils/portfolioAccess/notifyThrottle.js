const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days between sends
const MAX_SENDS = 3; // total sends allowed, lifetime, per owner

/**
 * Computes whether this owner can currently trigger the "notify team
 * admin" email, based on how many times they've sent it and when they
 * last sent it. Shared by login() (so the FE can show the button's
 * correct state before any click) and
 * notifyTeamAdminOfDeactivatedPortfolio (to actually enforce it).
 */
function getNotifyStatus(user) {
  const now = Date.now();
  const sentCount = user.portfolioNoticeCount || 0;
  const lastSentAt = user.lastPortfolioNoticeAt
    ? new Date(user.lastPortfolioNoticeAt).getTime()
    : null;

  const maxReached = sentCount >= MAX_SENDS;
  const nextAvailableAt = lastSentAt ? lastSentAt + COOLDOWN_MS : null;
  const inCooldown = !!nextAvailableAt && now < nextAvailableAt;

  return {
    canSend: !maxReached && !inCooldown,
    sentCount,
    maxSends: MAX_SENDS,
    maxReached,
    nextAvailableAt: inCooldown
      ? new Date(nextAvailableAt).toISOString()
      : null,
  };
}

module.exports = { getNotifyStatus, COOLDOWN_MS, MAX_SENDS };
