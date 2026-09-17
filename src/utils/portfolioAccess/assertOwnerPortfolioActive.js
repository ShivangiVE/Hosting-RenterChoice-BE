const Portfolio = require("../../models/Portfolio");

async function assertOwnerPortfolioActive(userId) {
  const portfolios = await Portfolio.find({ owners: userId })
    .select("_id portfolioName status")
    .lean();

  if (portfolios.length === 0) return;

  const hasActivePortfolio = portfolios.some((p) => p.status === "Active");
  if (hasActivePortfolio) return;

  const portfolioNames = portfolios.map((p) => p.portfolioName).filter(Boolean);
  const nameList = portfolioNames.join(", ");

  const err = new Error(
    `Your account has been deactivated. Please contact your Team Admin - Renter's Choice to restore access.`,
  );
  err.code = "PORTFOLIO_DEACTIVATED";
  err.statusCode = 403;
  err.portfolios = portfolioNames;
  err.portfolioIds = portfolios.map((p) => String(p._id));
  throw err;
}

module.exports = assertOwnerPortfolioActive;
