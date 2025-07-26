const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../../models/User");

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

//Login
exports.loginInternal = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !INTERNAL_ROLES.includes(user.role)) {
      res.status(401);
      throw new Error("Invalid credentials");
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      res.status(401);
      throw new Error("Invalid credentials");
    }

    res.status(200).json({
      _id: user._id,
      preferredName: user.preferredName,
      profileImage: user.profileImage,
      email: user.email,
      role: user.role,
      token: generateToken(user),
    });
  } catch (err) {
    next(err);
  }
};

//Change Password (logged-in)
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id).select("+password");
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      res.status(400);
      throw new Error("Current password is incorrect");
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    next(err);
  }
};

//Update Profile
exports.updateProfile = async (req, res, next) => {
  try {
    const { preferredName, email } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    if (email && email !== user.email) {
      const emailTaken = await User.findOne({ email });
      if (emailTaken) {
        res.status(400);
        throw new Error("Email already in use");
      }
      user.email = email;
    }

    if (preferredName) {
      user.preferredName = preferredName;
    }

    await user.save();

    res.json({
      message: "Profile updated",
      user: {
        _id: user._id,
        preferredName: user.preferredName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
};

//Forgot Password
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user || !INTERNAL_ROLES.includes(user.role)) {
      res.status(404);
      throw new Error("No internal account found with that email");
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

    res.status(200).json({
      message: "Reset link generated",
      resetUrl,
    });
  } catch (err) {
    next(err);
  }
};

//Reset Password (from token)
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user || !INTERNAL_ROLES.includes(user.role)) {
      res.status(400);
      throw new Error("Invalid or expired reset token");
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    res.json({ message: "Password has been reset successfully" });
  } catch (err) {
    next(err);
  }
};
