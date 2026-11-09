const mongoose = require("mongoose");
const User = require("../../models/User");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { hashInviteToken } = require("../../services/ownerInviteService");
const Portfolio = require("../../models/Portfolio");
const {
  verifyPortfolioNotifyToken,
  signPortfolioNotifyToken,
} = require("../../utils/portfolioAccess/notifyToken");

const {
  sendForgotPasswordOTPEmail,
  sendPortfolioDeactivatedNotice,
  sendPasswordChangedEmail,
} = require("../../services/emailService");
const { sendError, sendSuccess } = require("../../utils/response");
const { uploadFile, deleteFile } = require("../../utils/storageService");
const Company = require("../../models/ContactCards/Company");

const INVITE_INVALID_MSG =
  "This invitation link is invalid or has already been used. Please ask your property manager to resend it.";

const normalizeEmail = (e) =>
  String(e || "")
    .trim()
    .toLowerCase();
const cleanAccountNumber = (n) => String(n || "").trim();

const findSignupPortfolio = (accountNumber) =>
  Portfolio.findOne({
    portfolioAccountNumber: cleanAccountNumber(accountNumber),
    status: "Active",
  })
    .select("_id portfolioName")
    .lean();

async function linkOrCreateOwnerContact(user, session) {
  const existing = await Contact.findOne({
    contactType: "Owner",
    primaryEmailNormalized: user.email,
    isActive: true,
  }).session(session);

  if (existing) {
    if (!existing.user) {
      existing.user = user._id;
      await existing.save({ session });
    }
    return;
  }

  await Contact.create(
    [
      {
        contactType: "Owner",
        preferredName: user.preferredName,
        legalName: user.preferredName,
        primaryEmail: user.email,
        user: user._id,
        createdBy: user._id,
      },
    ],
    { session },
  );
}

// Owner pre-created by staff → finish signup (invite token + portfolio number)
async function claimInvitedOwner(
  res,
  { user, portfolioDoc, inviteToken, password, preferredName, accountNumber },
) {
  if (!inviteToken) {
    return sendError(
      res,
      "We've already emailed an invitation to this address. Please use the link in that email to finish setting up your account.",
      403,
      { code: "INVITE_REQUIRED" },
    );
  }

  const tokenHash = hashInviteToken(inviteToken);
  if (!user.inviteTokenHash || user.inviteTokenHash !== tokenHash) {
    return sendError(res, INVITE_INVALID_MSG, 400, { code: "INVITE_INVALID" });
  }

  const isOwnerOfPortfolio = await Portfolio.exists({
    _id: portfolioDoc._id,
    owners: user._id,
  });
  if (!isOwnerOfPortfolio) {
    return sendError(
      res,
      "This portfolio number doesn't match your invitation. Please check the number in your email.",
      400,
      { code: "PORTFOLIO_MISMATCH" },
    );
  }

  // One atomic, single-use update (two parallel submits can't both succeed)
  const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(10));
  const claimed = await User.findOneAndUpdate(
    { _id: user._id, accountStatus: "invited", inviteTokenHash: tokenHash },
    {
      $set: {
        password: passwordHash,
        accountStatus: "active",
        inviteAcceptedAt: new Date(),
        accountNumber: cleanAccountNumber(accountNumber),
        ...(preferredName?.trim() && { preferredName: preferredName.trim() }),
      },
      $unset: { inviteTokenHash: 1, inviteExpires: 1 },
      $inc: { externalWebSessionVersion: 1 },
    },
    { new: true, runValidators: true },
  );
  if (!claimed) {
    return sendError(res, INVITE_INVALID_MSG, 400, { code: "INVITE_INVALID" });
  }

  try {
    await linkOrCreateOwnerContact(claimed, null);
  } catch (e) {
    console.error("Owner contact link failed:", e);
  }

  const token = generateToken({
    user: claimed,
    platform: "web",
    portal: "external",
  });

  return sendSuccess(res, "Your account is set up", {
    _id: claimed._id,
    accountNumber: claimed.accountNumber,
    preferredName: claimed.preferredName,
    email: claimed.email,
    role: claimed.role,
    portfolio: { portfolioName: portfolioDoc.portfolioName },
    token,
  });
}

// Allowed roles
const EXTERNAL_ROLES = ["Vendor", "Owner", "Tenant"];

// Forgot/reset by OTP is shared by every portal (internal staff use the same screens)
const { INTERNAL_ROLES } = require("../../constants/roles");
const PASSWORD_RESET_ROLES = [...EXTERNAL_ROLES, ...INTERNAL_ROLES];

const generateToken = require("../../utils/generateToken");
const assertOwnerPortfolioActive = require("../../utils/portfolioAccess/assertOwnerPortfolioActive");
const {
  getNotifyStatus,
  MAX_SENDS,
} = require("../../utils/portfolioAccess/notifyThrottle");
const Contact = require("../../models/ContactCards/Contact");

// ── Password reset OTP ──
const OTP_LENGTH = 4;
const OTP_TTL_MS = 10 * 60 * 1000; // matches "expires in 10 minutes" in the email
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 3;
const MIN_PASSWORD_LENGTH = 8;
const ACCOUNT_NOT_FOUND_MSG =
  "We couldn't find an active account with that email address.";
const OTP_SENT_MSG = "We've sent a 4-digit code to your email.";
const OTP_INVALID_MSG = "Invalid or expired code. Please request a new one.";

// Cryptographically secure, zero-padded (e.g. "0427")
const generateOTP = () =>
  crypto
    .randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, "0");

// Keyed hash: a leaked DB can't be brute-forced back into codes
const hashOTP = (otp) =>
  crypto
    .createHmac("sha256", process.env.OTP_HASH_SECRET || process.env.JWT_SECRET)
    .update(String(otp))
    .digest("hex");

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Shared by verify-otp and reset: checks expiry + attempts, counts failures
async function checkResetOtp(email, otp) {
  const code = String(otp || "").trim();
  if (
    !normalizeEmail(email) ||
    !new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code)
  ) {
    return { ok: false, message: OTP_INVALID_MSG };
  }

  const user = await User.findOne({
    email: normalizeEmail(email),
    role: { $in: PASSWORD_RESET_ROLES },
    isActive: true,
  }).select("+resetPasswordOTP");

  if (
    !user ||
    !user.resetPasswordOTP ||
    !user.resetPasswordExpires ||
    user.resetPasswordExpires < Date.now()
  ) {
    return { ok: false, message: OTP_INVALID_MSG };
  }

  if ((user.resetPasswordOTPAttempts || 0) >= OTP_MAX_ATTEMPTS) {
    return {
      ok: false,
      message: "Too many incorrect attempts. Please request a new code.",
    };
  }

  if (!safeEqual(user.resetPasswordOTP, hashOTP(code))) {
    await User.updateOne(
      { _id: user._id },
      { $inc: { resetPasswordOTPAttempts: 1 } },
    );
    return { ok: false, message: OTP_INVALID_MSG };
  }

  return { ok: true, user };
}

const ALLOWED_PLATFORMS = ["web", "mobile"];

// External Register (Vendor, Owner, Tenant)
exports.register = async (req, res, next) => {
  try {
    const {
      accountNumber,
      preferredName,
      companyName,
      technicianName,
      password,
      role,
      inviteToken,
    } = req.body;
    const email = normalizeEmail(req.body.email);

    // Role validation
    if (!EXTERNAL_ROLES.includes(role)) {
      return sendError(
        res,
        "Invalid role. Allowed roles: Vendor, Owner, Tenant",
        400,
      );
    }

    // ===== Vendor Flow (COMPANY ACCOUNT NUMBER)
    let companyDoc = null;
    if (role === "Vendor") {
      if (!accountNumber) {
        return sendError(res, "Company account number is required", 400);
      }
      companyDoc = await Company.findOne({
        companyAccountNumber: accountNumber,
        isActive: true,
      }).lean();
      if (!companyDoc) {
        return sendError(res, "Invalid company account number", 400);
      }
    }

    // ===== Owner Flow (PORTFOLIO ACCOUNT NUMBER) — re-checked server-side =====
    let portfolioDoc = null;
    if (role === "Owner") {
      if (!cleanAccountNumber(accountNumber)) {
        return sendError(res, "Portfolio account number is required", 400);
      }
      portfolioDoc = await findSignupPortfolio(accountNumber);
      if (!portfolioDoc) {
        return sendError(res, "Invalid portfolio account number", 400);
      }
    }

    // Invite link → the invited account decides the email (it can't be swapped)
    if (role === "Owner" && inviteToken) {
      const invitedUser = await User.findOne({
        inviteTokenHash: hashInviteToken(inviteToken),
        role: "Owner",
        accountStatus: "invited",
      }).select("+inviteTokenHash role accountStatus email");

      if (!invitedUser) {
        return sendError(res, INVITE_INVALID_MSG, 400, {
          code: "INVITE_INVALID",
        });
      }
      if (invitedUser.email !== email) {
        return sendError(
          res,
          "Please sign up with the email address this invitation was sent to.",
          400,
          { code: "INVITE_EMAIL_MISMATCH" },
        );
      }
      return claimInvitedOwner(res, {
        user: invitedUser,
        portfolioDoc,
        inviteToken,
        password,
        preferredName,
        accountNumber,
      });
    }

    const existingUser = await User.findOne({ email }).select(
      "+inviteTokenHash role accountStatus",
    );
    if (existingUser) {
      if (
        role === "Owner" &&
        existingUser.role === "Owner" &&
        existingUser.accountStatus === "invited"
      ) {
        return claimInvitedOwner(res, {
          user: existingUser,
          portfolioDoc,
          inviteToken,
          password,
          preferredName,
          accountNumber,
        });
      }
      return sendError(res, "Email already registered", 409);
    }

    // User (+ portfolio link + contact for owners): all or nothing
    const session = await mongoose.startSession();
    let user;
    try {
      await session.withTransaction(async () => {
        [user] = await User.create(
          [
            {
              accountNumber: cleanAccountNumber(accountNumber) || undefined,
              preferredName,
              company: role === "Vendor" ? companyDoc._id : undefined,
              technicianName: role === "Vendor" ? technicianName : undefined,
              email,
              password,
              role,
            },
          ],
          { session },
        );

        user.externalWebSessionVersion += 1;
        await user.save({ session });

        if (portfolioDoc) {
          await Portfolio.updateOne(
            { _id: portfolioDoc._id, status: "Active" },
            { $addToSet: { owners: user._id } },
            { session },
          );
          await linkOrCreateOwnerContact(user, session);
        }
      });
    } finally {
      await session.endSession();
    }

    const token = generateToken({
      user,
      platform: "web",
      portal: "external",
    });

    return sendSuccess(
      res,
      "Registration successful",
      {
        _id: user._id,
        accountNumber: user.accountNumber,
        preferredName: user.preferredName,
        email: user.email,
        role: user.role,
        ...(portfolioDoc && {
          portfolio: { portfolioName: portfolioDoc.portfolioName },
        }),
        token,
      },
      201,
    );
  } catch (err) {
    if (err?.code === 11000) {
      return sendError(res, "Email already registered", 409);
    }
    if (err?.name === "ValidationError") {
      return sendError(res, err.message, 400);
    }
    next(err);
  }
};

// Verfiy Company Account Number
exports.verifyCompanyAccount = async (req, res) => {
  try {
    const { accountNumber } = req.params;

    const company = await Company.findOne({
      companyAccountNumber: accountNumber,
      isActive: true,
    })
      .select("companyName companyAccountNumber")
      .lean();

    if (!company) {
      return sendError(res, "Invalid account number", 404);
    }

    return sendSuccess(res, "Valid account", { company });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// Verify Portfolio Account Number (Owner signup) — public, rate-limited
exports.verifyPortfolioAccount = async (req, res) => {
  try {
    const accountNumber = cleanAccountNumber(req.params.accountNumber);
    if (!/^\d{5,6}$/.test(accountNumber)) {
      return sendError(res, "Invalid account number", 404);
    }

    const portfolio = await findSignupPortfolio(accountNumber);
    // Same message for "not found" and "deactivated"
    if (!portfolio) return sendError(res, "Invalid account number", 404);

    // Only what the signup screen needs — no ids, no owner details
    return sendSuccess(res, "Valid account", {
      portfolio: { portfolioName: portfolio.portfolioName },
    });
  } catch (err) {
    return sendError(res, "Verification failed", 500);
  }
};

// Verify owner invite link (signup page prefill) — public, rate-limited
exports.verifyOwnerInvite = async (req, res) => {
  try {
    const token = String(req.body?.token || "");
    if (!/^[a-f0-9]{64}$/.test(token)) {
      return sendError(res, INVITE_INVALID_MSG, 400, {
        code: "INVITE_INVALID",
      });
    }

    const user = await User.findOne({
      inviteTokenHash: hashInviteToken(token),
      role: "Owner",
      accountStatus: "invited",
      isActive: true,
    })
      .select("email preferredName")
      .lean();
    if (!user) {
      return sendError(res, INVITE_INVALID_MSG, 400, {
        code: "INVITE_INVALID",
      });
    }

    // Portfolio number is NOT returned — the owner must type it to verify
    return sendSuccess(res, "Invitation is valid", {
      email: user.email,
      preferredName: user.preferredName || "",
    });
  } catch (err) {
    return sendError(res, "Verification failed", 500);
  }
};

// Login (strict role-based)
exports.login = async (req, res, next) => {
  try {
    const { email, password, role, platform } = req.body;

    if (!platform || !ALLOWED_PLATFORMS.includes(platform)) {
      return sendError(
        res,
        "A valid platform ('web' or 'mobile') is required",
        400,
      );
    }

    if (!email || !password) {
      return sendError(res, "Email and password are required", 400);
    }

    // Validate allowed roles
    if (!EXTERNAL_ROLES.includes(role)) {
      return sendError(
        res,
        "Invalid role. Allowed roles: Vendor, Owner, Tenant",
        400,
      );
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!user) {
      return sendError(res, "Invalid credentials", 401);
    }

    if (!user.isActive) {
      return sendError(
        res,
        "Your account has been deactivated, Please contact RenterChoice",
        403,
      );
    }

    const isMatch = await user.matchPassword(password);

    if (user.accountStatus === "invited") {
      if (!isMatch) {
        return sendError(
          res,
          "Please finish setting up your account using the invitation link we emailed you.",
          403,
          { code: "INVITE_PENDING" },
        );
      }
      // Password matches → they already set it (e.g. older Forgot Password flow)
      user.accountStatus = "active";
      user.inviteAcceptedAt = new Date();
      user.inviteTokenHash = undefined;
      user.inviteExpires = undefined;
      await user.save();
    }

    if (!isMatch) {
      return sendError(res, "Invalid credentials", 401);
    }

    if (user.role !== role) {
      return sendError(
        res,
        `Role mismatch. You are registered as ${user.role}. Please log in using the correct role.`,
        403,
      );
    }

    if (user.role === "Owner") {
      try {
        await assertOwnerPortfolioActive(user._id);
      } catch (err) {
        const extra = { code: err.code };
        if (err.code === "PORTFOLIO_DEACTIVATED" && err.portfolioIds?.length) {
          extra.notifyToken = signPortfolioNotifyToken({
            userId: String(user._id),
            portfolioIds: err.portfolioIds,
          });
          extra.notifyStatus = getNotifyStatus(user);
        }
        return sendError(res, err.message, err.statusCode || 403, extra);
      }
    }

    if (platform === "web") {
      user.externalWebSessionVersion += 1;
      await user.save();
    }

    const token = generateToken({
      user,
      platform,
      portal: "external",
    });

    return sendSuccess(res, "Login successful", {
      _id: user._id,
      preferredName: user.preferredName,
      profileImage: user.profileImage,
      email: user.email,
      role: user.role,
      token,
    });
  } catch (err) {
    next(err);
  }
};

exports.notifyTeamAdminOfDeactivatedPortfolio = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return sendError(res, "Token is required", 400);

    let payload;
    try {
      payload = verifyPortfolioNotifyToken(token);
    } catch {
      return sendError(
        res,
        "This request has expired. Please try logging in again.",
        400,
      );
    }

    const [owner, portfolios] = await Promise.all([
      User.findById(payload.userId).select(
        "preferredName firstName lastName email portfolioNoticeCount lastPortfolioNoticeAt",
      ),
      Portfolio.find({
        _id: { $in: payload.portfolioIds },
        status: "Deactivated",
      })
        .select("portfolioName")
        .lean(),
    ]);

    if (!owner || portfolios.length === 0) {
      return sendError(
        res,
        "Nothing to notify — the portfolio status may have changed.",
        400,
      );
    }

    // ── Throttle: max 3 notifications ever, with a 3-day gap required
    // between each send. Prevents a blocked owner from spamming
    // OfficeAdmins by repeatedly retrying login and clicking "Send Email".
    const notifyStatus = getNotifyStatus(owner);

    if (!notifyStatus.canSend) {
      const message = notifyStatus.maxReached
        ? `You've already sent this notification ${MAX_SENDS} times. Please contact your team admin directly.`
        : `You've already sent this notification. You can send it again on ${new Date(
            notifyStatus.nextAvailableAt,
          ).toDateString()}.`;

      return sendError(res, message, 429, { notifyStatus });
    }

    const officeAdmins = await User.find({
      role: "OfficeAdmin",
      isActive: true,
    })
      .select("email preferredName")
      .lean();

    if (officeAdmins.length === 0) {
      return sendError(
        res,
        "No team admin is currently configured to receive this request.",
        500,
      );
    }

    await sendPortfolioDeactivatedNotice({
      admins: officeAdmins,
      owner,
      portfolios,
    });

    // Record the send only after it succeeds.
    owner.portfolioNoticeCount = notifyStatus.sentCount + 1;
    owner.lastPortfolioNoticeAt = new Date();
    await owner.save();

    return sendSuccess(res, "Your team admin has been notified.", {
      notifyStatus: getNotifyStatus(owner),
    });
  } catch (err) {
    return sendError(
      res,
      "Failed to send notification. Please try again.",
      500,
    );
  }
};

// Update Profile
exports.updateProfile = async (req, res, next) => {
  try {
    const { preferredName, firstName, lastName } = req.body;
    const userId = req.user.id;

    const updateData = {};

    if (preferredName) updateData.preferredName = preferredName;
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;

    if (Object.keys(updateData).length === 0) {
      return sendError(res, "No valid fields provided to update", 400);
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!updatedUser) {
      return sendError(res, "User not found", 404);
    }

    return sendSuccess(res, "Profile updated successfully", {
      user: updatedUser,
    });
  } catch (err) {
    next(err);
  }
};

exports.uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, "No image file provided", 400);
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return sendError(res, "User not found", 404);
    }

    // Delete old avatar if exists
    if (user.profileImage) {
      await deleteFile(user.profileImage);
    }

    // Upload new avatar
    const imageUrl = await uploadFile(req.file, "uploads/avatars");

    user.profileImage = imageUrl;
    await user.save();

    return sendSuccess(res, "Profile image updated", {
      profileImage: imageUrl,
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to upload profile image", 500);
  }
};

// Change Password
exports.changePassword = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (
      !currentPassword ||
      String(newPassword || "").length < MIN_PASSWORD_LENGTH
    ) {
      return sendError(
        res,
        `Current password and a new password of at least ${MIN_PASSWORD_LENGTH} characters are required`,
        400,
      );
    }
    const user = await User.findById(userId);
    if (!user) {
      return sendError(res, "User not found", 404);
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return sendError(res, "Current password is incorrect", 401);
    }

    user.password = newPassword;

    user.internalWebSessionVersion += 1;
    user.externalWebSessionVersion += 1;

    await user.save();

    sendPasswordChangedEmail({
      to: user.email,
      name: user.preferredName,
    }).catch((e) =>
      console.error("Password changed notice failed:", e.message),
    );

    return sendSuccess(res, "Password updated successfully");
  } catch (err) {
    next(err);
  }
};

// Forgot Password — sends a 4-digit code to an active account
exports.forgotPassword = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) return sendError(res, "Email is required", 400);

  try {
    const user = await User.findOne({
      email,
      role: { $in: PASSWORD_RESET_ROLES },
      isActive: true,
    }).select("email resetPasswordExpires");

    // Not registered, or deactivated → tell the user (same message for both)
    if (!user) return sendError(res, ACCOUNT_NOT_FOUND_MSG, 404);

    // Cooldown: a code was sent under a minute ago → don't send another
    const lastIssuedAt = user.resetPasswordExpires
      ? new Date(user.resetPasswordExpires).getTime() - OTP_TTL_MS
      : 0;
    if (Date.now() - lastIssuedAt < OTP_RESEND_COOLDOWN_MS) {
      return sendSuccess(
        res,
        "We've already sent a code to your email. Please check your inbox.",
      );
    }

    const otp = generateOTP();
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          resetPasswordOTP: hashOTP(otp),
          resetPasswordExpires: new Date(Date.now() + OTP_TTL_MS),
          resetPasswordOTPAttempts: 0,
        },
      },
    );

    try {
      await sendForgotPasswordOTPEmail(user.email, otp);
    } catch (mailErr) {
      // Email failed → clear the code so the user can retry straight away
      await User.updateOne(
        { _id: user._id },
        { $unset: { resetPasswordOTP: 1, resetPasswordExpires: 1 } },
      );
      console.error("Forgot password email failed:", mailErr.message);
      return sendError(
        res,
        "We couldn't send the email right now. Please try again in a moment.",
        502,
      );
    }

    return sendSuccess(res, OTP_SENT_MSG);
  } catch (err) {
    console.error("Forgot password failed:", err.message);
    return sendError(
      res,
      "Failed to process your request. Please try again.",
      500,
    );
  }
};

// Verify OTP only (doesn't use it up)
exports.verifyOtp = async (req, res, next) => {
  try {
    const result = await checkResetOtp(req.body?.email, req.body?.otp);
    if (!result.ok) return sendError(res, result.message, 400);
    return sendSuccess(res, "OTP verified successfully");
  } catch (err) {
    next(err);
  }
};

// Reset Password (OTP is single-use)
exports.resetPassword = async (req, res, next) => {
  try {
    const password = String(req.body?.password || "");
    if (password.length < MIN_PASSWORD_LENGTH) {
      return sendError(
        res,
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        400,
      );
    }

    const result = await checkResetOtp(req.body?.email, req.body?.otp);
    if (!result.ok) return sendError(res, result.message, 400);

    const { user } = result;
    user.password = password; // hashed by the pre-save hook

    // Log out every existing session
    user.internalWebSessionVersion += 1;
    user.externalWebSessionVersion += 1;

    // Invited owner proved email ownership → activate
    if (user.accountStatus === "invited") {
      user.accountStatus = "active";
      user.inviteAcceptedAt = new Date();
      user.inviteTokenHash = undefined;
      user.inviteExpires = undefined;
    }

    // Single-use
    user.resetPasswordOTP = undefined;
    user.resetPasswordExpires = undefined;
    user.resetPasswordOTPAttempts = 0;

    await user.save();

    sendPasswordChangedEmail({
      to: user.email,
      name: user.preferredName,
    }).catch((e) =>
      console.error("Password changed notice failed:", e.message),
    );

    return sendSuccess(
      res,
      "Password reset successfully. Please log in with your new password.",
    );
  } catch (err) {
    next(err);
  }
};
