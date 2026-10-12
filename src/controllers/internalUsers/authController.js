const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../../models/User");
const { sendSuccess, sendError } = require("../../utils/response");
const { INTERNAL_ROLES } = require("../../constants/roles");

// Generate JWT
const generateToken = require("../../utils/generateToken");

// Login
exports.loginInternal = async (req, res, next) => {
  try {
    const { email, password, platform = "web" } = req.body;

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !INTERNAL_ROLES.includes(user.role)) {
      return sendError(res, "Invalid credentials", 401);
    }

    if (!user.isActive) {
      return sendError(
        res,
        "Your account has been deactivated. Please contact your administrator.",
        403,
      );
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return sendError(res, "Invalid credentials", 401);
    }

    if (platform === "web") {
      user.internalWebSessionVersion += 1;
      await user.save();
    }

    const token = generateToken({
      user,
      platform,
      portal: "internal",
    });

    const userData = {
      _id: user._id,
      preferredName: user.preferredName,
      profileImage: user.profileImage,
      email: user.email,
      role: user.role,
      defaultRepairTab: user.defaultRepairTab,
      itemsPerPagePreference: user.itemsPerPagePreference,
      token,
    };

    return sendSuccess(res, `You are logged in as ${user.role}`, userData);
  } catch (err) {
    next(err);
  }
};

// Impersonate Vendor
exports.impersonateVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;

    const vendor = await User.findById(vendorId);

    if (!vendor || vendor.role !== "Vendor") {
      return sendError(res, "Vendor not found", 404);
    }

    if (!vendor.isActive) {
      return sendError(res, "Vendor account is inactive", 403);
    }

    const token = generateToken({
      user: vendor,
      platform: "impersonate",
      portal: "external",
    });

    return sendSuccess(res, "Vendor impersonation successful", {
      token,
      user: {
        _id: vendor._id,
        email: vendor.email,
        technicianName: vendor.technicianName,
        role: vendor.role,
      },
    });
  } catch (error) {
    return sendError(res, "Vendor impersonation failed", 500);
  }
};

// Change Password (logged-in)
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id).select("+password");
    if (!user) {
      return sendError(res, "User not found", 404);
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return sendError(res, "Current password is incorrect", 400);
    }

    user.password = newPassword;

    user.internalWebSessionVersion += 1;
    user.externalWebSessionVersion += 1;

    await user.save();

    return sendSuccess(res, "Password updated successfully");
  } catch (err) {
    next(err);
  }
};

const PROFILE_FIELDS = [
  "legalName",
  "preferredName",
  "replyToEmail",
  "alertEmail",
  "timeZone",
  "contactInfo",
  "emailSignature",
];
const PROFILE_SELECT = `email role profileImage ${PROFILE_FIELDS.join(" ")}`;

// GET /profile → load Settings → My Profile
exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select(PROFILE_SELECT).lean();
    if (!user) return sendError(res, "User not found", 404);
    return sendSuccess(res, "Profile fetched", user);
  } catch (err) {
    next(err);
  }
};

// Update Profile
exports.updateProfile = async (req, res, next) => {
  try {
    const updates = {};
    PROFILE_FIELDS.forEach((f) => {
      if (req.body[f] !== undefined) updates[f] = String(req.body[f]).trim();
    });

    if (updates.preferredName === "") {
      return sendError(res, "Preferred name is required", 400);
    }
    if (Object.keys(updates).length === 0) {
      return sendError(res, "No valid fields provided to update", 400);
    }

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
    }).select(PROFILE_SELECT);

    if (!user) return sendError(res, "User not found", 404);
    return sendSuccess(res, "Profile updated successfully", user);
  } catch (err) {
    next(err);
  }
};

// Forgot Password
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user || !INTERNAL_ROLES.includes(user.role)) {
      return sendError(res, "No internal account found with that email", 404);
    }

    const resetToken = crypto.randomBytes(20).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour

    await user.save();

    const resetUrl = `${process.env.CORS_ORIGIN}/reset?token=${resetToken}`;

    return sendSuccess(res, "Reset link generated", { resetUrl });
  } catch (err) {
    next(err);
  }
};

// Reset Password (from token)
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user || !INTERNAL_ROLES.includes(user.role)) {
      return sendError(res, "Invalid or expired reset token", 400);
    }

    user.password = password;

    user.internalWebSessionVersion += 1;
    user.externalWebSessionVersion += 1;

    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    return sendSuccess(res, "Password has been reset successfully");
  } catch (err) {
    next(err);
  }
};
