const crypto = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/User");
const Portfolio = require("../models/Portfolio");

const {
  sendOwnerPortfolioInviteEmail,
  sendOwnerAddedToPortfolioEmail,
} = require("./emailService");

// Frontend base for email links — same rule as internal authController:
// CLIENT_APP_URL, else the first CORS_ORIGIN (Render only has CORS_ORIGIN)
const FRONTEND_BASE_URL = (
  process.env.CLIENT_APP_URL ||
  process.env.CORS_ORIGIN ||
  ""
)
  .split(",")[0]
  .trim();

const appUrl = (path) => {
  if (!FRONTEND_BASE_URL) {
    throw new Error("CLIENT_APP_URL / CORS_ORIGIN is not configured");
  }
  return new URL(path, FRONTEND_BASE_URL).toString();
};
const OWNER_SIGNUP_PATH = process.env.OWNER_SIGNUP_PATH || "/signup";
const OWNER_LOGIN_PATH = process.env.OWNER_LOGIN_PATH || "/login";

const hashInviteToken = (raw) =>
  crypto.createHash("sha256").update(String(raw)).digest("hex");

const withQuery = (base, params) => {
  const url = new URL(base);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
};

/** New single-use token (replaces any older link) + invite email. */
async function sendOwnerInvite({ owner, portfolio }) {
  const rawToken = crypto.randomBytes(32).toString("hex");

  const result = await User.updateOne(
    { _id: owner._id, role: "Owner", accountStatus: "invited" },
    {
      $set: {
        inviteTokenHash: hashInviteToken(rawToken), // only the hash is stored
        ownerInviteSentAt: new Date(),
      },
      // No expiry: valid until used or replaced by a resend
      $unset: { inviteExpires: 1 },
    },
  );
  if (result.matchedCount === 0) return { sent: false, reason: "not_invited" };

  await sendOwnerPortfolioInviteEmail({
    to: owner.email,
    name: owner.preferredName,
    portfolioName: portfolio.portfolioName,
    portfolioNumber: portfolio.portfolioAccountNumber,
    signupUrl: withQuery(appUrl(OWNER_SIGNUP_PATH), { invite: rawToken }),
  });
  return { sent: true, type: "invite" };
}

async function sendOwnerAddedNotice({ owner, portfolio }) {
  await sendOwnerAddedToPortfolioEmail({
    to: owner.email,
    name: owner.preferredName,
    portfolioName: portfolio.portfolioName,
    portfolioNumber: portfolio.portfolioAccountNumber,
    loginUrl: appUrl(OWNER_LOGIN_PATH),
  });
  return { sent: true, type: "added" };
}

/**
 * Call AFTER the portfolio save has committed, with only the NEWLY attached
 * owner ids. Never throws for one bad email — failures are logged.
 */
async function notifyOwnersAttachedToPortfolio({ portfolioId, ownerIds }) {
  const ids = [...new Set((ownerIds || []).map(String))].filter((id) =>
    mongoose.isValidObjectId(id),
  );
  const summary = { invited: 0, notified: 0, failed: 0 };
  if (!ids.length) return summary;

  const [portfolio, owners] = await Promise.all([
    Portfolio.findOne({ _id: portfolioId, status: { $ne: "Deactivated" } })
      .select("portfolioName portfolioAccountNumber")
      .lean(),
    User.find({ _id: { $in: ids }, role: "Owner", isActive: true })
      .select("email preferredName accountStatus")
      .lean(),
  ]);
  if (!portfolio) return summary;

  const results = await Promise.allSettled(
    owners.map((owner) =>
      owner.accountStatus === "invited"
        ? sendOwnerInvite({ owner, portfolio })
        : sendOwnerAddedNotice({ owner, portfolio }),
    ),
  );

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      summary.failed += 1;
      console.error(
        `Owner portfolio email failed (user ${owners[i]._id}):`,
        r.reason?.message || r.reason,
      );
    } else if (r.value.type === "invite") summary.invited += 1;
    else if (r.value.type === "added") summary.notified += 1;
  });
  return summary;
}

module.exports = {
  hashInviteToken,
  sendOwnerInvite,
  notifyOwnersAttachedToPortfolio,
};
