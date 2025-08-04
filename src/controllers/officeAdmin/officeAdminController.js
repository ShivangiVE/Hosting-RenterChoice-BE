const User = require("../../models/User");

const INTERNAL_ROLES = [
  "AccountsTeam",
  "RepairsTeam",
  "LeaseTeam",
  "MarketingTeam",
  "LandlordsTeam",
  "InspectionClerk",
];

// OfficeAdmin creates internal team users
exports.createInternalUser = async (req, res) => {
  const { preferredName, email, password, role } = req.body;

  if (!INTERNAL_ROLES.includes(role)) {
    return res
      .status(400)
      .json({ message: "Invalid role for internal creation" });
  }

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    return res.status(400).json({ message: "User already exists" });
  }

  const newUser = await User.create({
    preferredName,
    email,
    password,
    role,
    createdBy: req.user._id, // trace who created
  });

  res.status(201).json({
    _id: newUser._id,
    preferredName: newUser.preferredName,
    email: newUser.email,
    role: newUser.role,
  });
};

// OfficeAdmin can list all team users
exports.getInternalUsers = async (req, res) => {
  const filter = {
    role: { $in: INTERNAL_ROLES },
  };

  if (req.query.createdBy) {
    filter.createdBy = req.query.createdBy;
  }

  const users = await User.find(filter).select("-password");
  res.json(users);
};

// OfficeAdmin can delete internal user
exports.deleteInternalUser = async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: "Internal user deleted" });
};

// OfficeAdmin can update internal user role (optional)
exports.updateInternalUserRole = async (req, res) => {
  const { role } = req.body;

  if (!INTERNAL_ROLES.includes(role)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  const updated = await User.findByIdAndUpdate(
    req.params.id,
    { role },
    { new: true }
  ).select("-password");

  res.json(updated);
};
