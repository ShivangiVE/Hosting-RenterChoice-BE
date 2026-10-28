const crypto = require("crypto");

// Invite links stay valid for 72 hours
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

const hashToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

/**
 * Creates a one-time invite token.
 * - `token` goes ONLY into the email link (never stored).
 * - `tokenHash` is stored on the user, so a DB leak can't be used to log in.
 */
const createInviteToken = () => {
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  };
};

// Random, never-shown password so the account exists but nobody can log in
// until the invite is accepted (User.password is required in the schema).
const createUnusablePassword = () => crypto.randomBytes(48).toString("hex");

module.exports = {
  INVITE_TTL_MS,
  hashToken,
  createInviteToken,
  createUnusablePassword,
};
