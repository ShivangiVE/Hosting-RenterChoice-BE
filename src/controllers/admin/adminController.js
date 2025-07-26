const User = require("../../models/User");

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

exports.getAllUsers = async (req, res) => {
  const users = await User.find().select("-password");
  res.json(users);
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
