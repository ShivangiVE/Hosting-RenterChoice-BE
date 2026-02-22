const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../../models/User");
const { sendSuccess, sendError } = require("../../utils/response");

const INTERNAL_ROLES = [
  "Admin",
  "OfficeAdmin",
  "AccountsTeam",
  "RepairsTeam",
  "LeaseTeam",
  "MarketingTeam",
  "LandlordsTeam",
  "InspectionClerk",
];

// Generate JWT
const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// Login
exports.loginInternal = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !INTERNAL_ROLES.includes(user.role)) {
      return sendError(res, "Invalid credentials", 401);
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return sendError(res, "Invalid credentials", 401);
    }

    const userData = {
      _id: user._id,
      preferredName: user.preferredName,
      profileImage: user.profileImage,
      email: user.email,
      role: user.role,
      defaultRepairTab: user.defaultRepairTab,
      token: generateToken(user),
    };

    return sendSuccess(res, `You are logged in as ${user.role}`, userData);
  } catch (err) {
    next(err);
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
    await user.save();

    return sendSuccess(res, "Password updated successfully");
  } catch (err) {
    next(err);
  }
};

// Update Profile
exports.updateProfile = async (req, res, next) => {
  try {
    const { preferredName, email } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return sendError(res, "User not found", 404);
    }

    if (email && email !== user.email) {
      const emailTaken = await User.findOne({ email });
      if (emailTaken) {
        return sendError(res, "Email already in use", 400);
      }
      user.email = email;
    }

    if (preferredName) {
      user.preferredName = preferredName;
    }

    await user.save();

    const updatedData = {
      _id: user._id,
      preferredName: user.preferredName,
      email: user.email,
      role: user.role,
    };

    return sendSuccess(res, "Profile updated", updatedData);
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
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    return sendSuccess(res, "Password has been reset successfully");
  } catch (err) {
    next(err);
  }
};
