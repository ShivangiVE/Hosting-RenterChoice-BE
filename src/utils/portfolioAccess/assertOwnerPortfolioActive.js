const Portfolio = require("../../models/Portfolio");

async function assertOwnerPortfolioActive(userId) {
  const portfolios = await Portfolio.find({ owners: userId })
    .select("portfolioName status")
    .lean();

  if (portfolios.length === 0) return; // owner not attached to any portfolio — allow login

  const hasActivePortfolio = portfolios.some((p) => p.status === "Active");
  if (hasActivePortfolio) return; // at least one active portfolio — allow login

  // At this point every portfolio this owner belongs to is Deactivated.
  const portfolioNames = portfolios.map((p) => p.portfolioName).filter(Boolean);
  const nameList = portfolioNames.join(", ");

  const err = new Error(
    `Your account has been deactivated. Please contact ${nameList} to restore access.`,
  );
  err.code = "PORTFOLIO_DEACTIVATED";
  err.statusCode = 403;
  err.portfolios = portfolioNames; 
  throw err;
}

module.exports = assertOwnerPortfolioActive;
