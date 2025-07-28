const User = require("../../models/User");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendForgotPasswordEmail } = require("../../services/emailService");

// Allowed roles
const EXTERNAL_ROLES = ["Vendor", "Owner", "Tenant"];

const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// External Register (Vendor, Owner, Tenant)
exports.register = async (req, res, next) => {
  try {
    const {
      accountNumber,
      preferredName,
      companyName,
      technicianName,
      email,
      password,
      role,
    } = req.body;

    if (!EXTERNAL_ROLES.includes(role)) {
      res.status(400);
      throw new Error("Invalid role");
    }

    if (!accountNumber) {
      res.status(400);
      throw new Error("Account Number is required for registration");
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      res.status(400);
      throw new Error("User already exists");
    }

    const user = await User.create({
      accountNumber,
      preferredName,
      companyName: role === "Vendor" ? companyName : undefined,
      technicianName: role === "Vendor" ? technicianName : undefined,
      email,
      password,
      role,
    });

    res.status(201).json({
      _id: user._id,
      accountNumber: user.accountNumber,
      preferredName: user.preferredName,

      email: user.email,
      role: user.role,
      token: generateToken(user),
    });
  } catch (err) {
    next(err);
  }
};

// Login (any role)
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      res.status(400);
      throw new Error("Invalid credentials");
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      res.status(400);
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

// Update Profile
exports.updateProfile = async (req, res, next) => {
  try {
    const { preferredName } = req.body;
    const userId = req.user.id;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { preferredName },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) {
      res.status(404);
      throw new Error("User not found");
    }

    res.status(200).json({
      message: "Profile updated",
      user: updatedUser,
    });
  } catch (err) {
    next(err);
  }
};

// Change Password
exports.changePassword = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(userId);
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

    res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    next(err);
  }
};

// Forgot Password
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      res.status(404);
      throw new Error("No account with that email found.");
    }

    const resetToken = crypto.randomBytes(20).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour

    await user.save();

     const resetUrl = `${process.env.CORS_ORIGIN}/reset-password?token=${resetToken}`;

    await sendForgotPasswordEmail(user, resetToken);

    res.status(200).json({
      message: "Password reset link generated.",
      resetUrl,
    });
  } catch (err) {
    next(err);
  }
};

// Reset Password
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      res.status(400);
      throw new Error("Invalid or expired reset token.");
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    res.status(200).json({ message: "Password has been reset." });
  } catch (err) {
    next(err);
  }
};
