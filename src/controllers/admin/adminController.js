const User = require("../../models/User");
const generateToken = require("../../utils/generateToken");

const INTERNAL_ROLES = [
  "OfficeAdmin",
  "AccountsTeam",
  "RepairsTeam",
  "LeaseTeam",
  "MarketingTeam",
  "LandlordsTeam",
  "InspectionClerk",
];

// Admin creates OfficeAdmin
exports.createOfficeAdmin = async (req, res) => {
  const { preferredName, email, password, role } = req.body;

  if (role !== "OfficeAdmin") {
    return res.status(400).json({ message: "Role must be OfficeAdmin only" });
  }

  const exists = await User.findOne({ email });
  if (exists) {
    return res.status(400).json({ message: "User already exists" });
  }

  const user = await User.create({
    preferredName,
    email,
    password,
    role,
    createdBy: req.user.id,
  });

  res.status(201).json({
    _id: user._id,
    preferredName: user.preferredName,
    email: user.email,
    role: user.role,
  });
};

// Admin creates Internal Users too
exports.createInternalUser = async (req, res) => {
  const { preferredName, email, password, role } = req.body;

  if (!INTERNAL_ROLES.includes(role)) {
    return res.status(400).json({ message: "Invalid internal role" });
  }

  const exists = await User.findOne({ email });
  if (exists) {
    return res.status(400).json({ message: "User already exists" });
  }

  const user = await User.create({
    preferredName,
    email,
    password,
    role,
  });

  res.status(201).json({
    _id: user._id,
    preferredName: user.preferredName,
    email: user.email,
    role: user.role,
  });
};

// Get All Users
exports.getAllUsers = async (req, res) => {
  const users = await User.find().select("-password");
  res.json(users);
};

// Get all Office Admin
exports.getOfficeAdmins = async (req, res) => {
  try {
    const officeAdmins = await User.find({ role: "OfficeAdmin" }).select(
      "preferredName email"
    );
    res.status(200).json(officeAdmins);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch Office Admins" });
  }
};

// Get Users as per office admin team
exports.getTeamsGroupedByOfficeAdmin = async (req, res) => {
  try {
    // Find all office admins
    const officeAdmins = await User.find({ role: "OfficeAdmin" }).select(
      "_id preferredName email"
    );

    const result = [];

    for (const admin of officeAdmins) {
      const team = await User.find({
        createdBy: admin._id,
        role: { $in: INTERNAL_ROLES },
      }).select("preferredName email role");

      result.push({
        officeAdmin: {
          _id: admin._id,
          name: admin.preferredName,
          email: admin.email,
        },
        teamMembers: team,
      });
    }

    res.json(result);
  } catch (error) {
    console.error("Failed to group teams:", error);
    res.status(500).json({ message: "Server error grouping teams" });
  }
};


//Logged in as office Admin
// Impersonate an OfficeAdmin
exports.impersonateOfficeAdmin = async (req, res) => {
  try {
    const { officeAdminId } = req.params;

    // Ensure target user exists and is an OfficeAdmin
    const targetUser = await User.findById(officeAdminId);
    if (!targetUser || targetUser.role !== "OfficeAdmin") {
      return res.status(404).json({ message: "Office Admin not found" });
    }

    // Only Admin can impersonate — this is enforced in the route using authorize("Admin")

    // Issue token for the OfficeAdmin
    const token = generateToken(targetUser);

    res.status(200).json({
      token,
      user: {
        _id: targetUser._id,
        email: targetUser.email,
        preferredName: targetUser.preferredName,
        role: targetUser.role,
      },
    });
  } catch (error) {
    console.error("Impersonation error:", error);
    res.status(500).json({ message: "Impersonation failed" });
  }
};


exports.deleteUser = async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: "User deleted" });
};

exports.updateUserRole = async (req, res) => {
  const { role } = req.body;
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { role },
    { new: true }
  ).select("-password");
  res.json(user);
};
