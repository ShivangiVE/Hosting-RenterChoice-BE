const User = require("../../models/User");
const { sendError, sendSuccess } = require("../../utils/response");
const { hashToken } = require("../../utils/inviteToken");


// At least 8 chars with a letter and a number
const STRONG_PASSWORD = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

const ROLE_LABELS = {
  BrokerageAdmin: "Brokerage Admin",
  OfficeAdmin: "Team Admin",
};


const INVALID_LINK =
  "This invitation link is invalid or has expired. Please ask your administrator to resend it.";

const findUserByInviteToken = (token) =>
  User.findOne({
    inviteTokenHash: hashToken(token),
    inviteExpires: { $gt: new Date() },
    isActive: true,
  }).populate("team", "businessLegalName");

// GET /api/auth/invite/:token  (public) — lets the page show who is invited
exports.validateInvite = async (req, res) => {
  try {
    const token = String(req.params.token || "");
    if (token.length < 32) return sendError(res, INVALID_LINK, 400);

    const user = await findUserByInviteToken(token);
    if (!user) return sendError(res, INVALID_LINK, 400);

    return sendSuccess(res, "Invitation is valid", {
      email: user.email,
      name: user.preferredName,
      roleLabel: ROLE_LABELS[user.role] || user.role,
      teamName: user.team?.businessLegalName || "",
    });
  } catch (err) {
    return sendError(res, "Failed to validate invitation", 500);
  }
};

// POST /api/auth/accept-invite  (public) — { token, password }
exports.acceptInvite = async (req, res) => {
  try {
    const token = String(req.body?.token || "");
    const password = String(req.body?.password || "");

    if (token.length < 32) return sendError(res, INVALID_LINK, 400);
    if (!STRONG_PASSWORD.test(password)) {
      return sendError(
        res,
        "Password must be at least 8 characters and include a letter and a number",
        400,
      );
    }

    const user = await findUserByInviteToken(token);
    if (!user) return sendError(res, INVALID_LINK, 400);

    user.password = password; // hashed by the User pre-save hook
    user.inviteTokenHash = undefined; // one-time use
    user.inviteExpires = undefined;
    user.inviteAcceptedAt = new Date();
    user.internalWebSessionVersion += 1;
    user.externalWebSessionVersion += 1;
    await user.save();

    return sendSuccess(res, "Password set successfully. You can now log in.", {
      email: user.email,
    });
  } catch (err) {
    return sendError(res, "Failed to set password", 500);
  }
};
