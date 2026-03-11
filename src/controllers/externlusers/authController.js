const User = require("../../models/User");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const {
  sendForgotPasswordEmail,
  sendForgotPasswordOTPEmail,
} = require("../../services/emailService");
const { sendError, sendSuccess } = require("../../utils/response");
const { uploadFile, deleteFile } = require("../../utils/storageService");
const Company = require("../../models/ContactCards/Company");

// Allowed roles
const EXTERNAL_ROLES = ["Vendor", "Owner", "Tenant"];

const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// Generate 4-digit OTP
const generateOTP = () => Math.floor(1000 + Math.random() * 9000).toString();

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

    // Role validation
    if (!EXTERNAL_ROLES.includes(role)) {
      return sendError(
        res,
        "Invalid role. Allowed roles: Vendor, Owner, Tenant",
        400,
      );
    }

    // ===== Vendor Flow (ACCOUNT NUMBER VERIFICATION) =====
    let companyDoc = null;

    if (role === "Vendor") {
      if (!accountNumber) {
        return sendError(res, "Company account number is required", 400);
      }

      //  Verify company exists
      companyDoc = await Company.findOne({
        companyAccountNumber: accountNumber,
        isActive: true,
      }).lean();

      if (!companyDoc) {
        return sendError(res, "Invalid company account number", 400);
      }
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return sendError(res, "Email already registered", 409);
    }

    const user = await User.create({
      accountNumber,
      preferredName,
      company: role === "Vendor" ? companyDoc._id : undefined,
      technicianName: role === "Vendor" ? technicianName : undefined,
      email,
      password,
      role,
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
        token: generateToken(user),
      },
      201,
    );
  } catch (err) {
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

// Login (strict role-based)
exports.login = async (req, res, next) => {
  try {
    const { email, password, role } = req.body;

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

    const token = generateToken(user);

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

    if (!currentPassword || !newPassword) {
      return sendError(res, "Current and new passwords are required", 400);
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
    await user.save();

    return sendSuccess(res, "Password updated successfully");
  } catch (err) {
    next(err);
  }
};

// Forgot Password with OTP
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return sendError(res, "Email is required", 400);
    }

    const user = await User.findOne({ email });
    if (!user) {
      return sendError(res, "No account found with this email", 404);
    }

    const otp = generateOTP();
    user.resetPasswordOTP = otp;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    await sendForgotPasswordOTPEmail(user.email, otp);

    return sendSuccess(res, "OTP has been sent to your email");
  } catch (err) {
    return sendError(res, "Failed to process forgot password request", 500);
  }
};

// Verify OTP Only (without resetting password)
exports.verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return sendError(res, "Email and OTP are required", 400);
    }

    const user = await User.findOne({ email });
    if (!user) {
      return sendError(res, "User not found", 404);
    }

    if (user.resetPasswordOTP !== otp) {
      return sendError(res, "Invalid OTP", 400);
    }

    if (user.resetPasswordExpires < Date.now()) {
      return sendError(res, "OTP has expired", 400);
    }

    return sendSuccess(res, "OTP verified successfully");
  } catch (err) {
    next(err);
  }
};

// Reset Password
exports.resetPassword = async (req, res, next) => {
  try {
    const { email, otp, password } = req.body;

    if (!email || !otp || !password) {
      return sendError(res, "Email, OTP, and new password are required", 400);
    }

    const user = await User.findOne({ email });
    if (!user) {
      return sendError(res, "User not found", 404);
    }

    if (user.resetPasswordOTP !== otp) {
      return sendError(res, "Invalid OTP", 400);
    }

    if (user.resetPasswordExpires < Date.now()) {
      return sendError(res, "OTP has expired", 400);
    }

    user.password = password;
    user.resetPasswordOTP = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return sendSuccess(res, "Password reset successfully");
  } catch (err) {
    next(err);
  }
};
