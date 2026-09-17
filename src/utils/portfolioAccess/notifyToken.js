const jwt = require("jsonwebtoken");

const PURPOSE = "portfolio_deactivated_notify";
const TTL = "15m";
const SECRET = process.env.PORTFOLIO_NOTIFY_TOKEN_SECRET;

function signPortfolioNotifyToken({ userId, portfolioIds }) {
  return jwt.sign({ purpose: PURPOSE, userId, portfolioIds }, SECRET, {
    expiresIn: TTL,
  });
}

function verifyPortfolioNotifyToken(token) {
  const payload = jwt.verify(token, SECRET);
  if (payload.purpose !== PURPOSE) {
    throw new Error("Invalid token purpose");
  }
  return payload;
}

module.exports = { signPortfolioNotifyToken, verifyPortfolioNotifyToken };
