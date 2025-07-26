require("dotenv").config();
const connectDB = require("../src/config/db");
const User = require("../src/models/User");

const createMasterAdmin = async () => {
  await connectDB();

  const existing = await User.findOne({ role: "Admin" });
  if (existing) {
    console.log("✅ Master Admin already exists");
    process.exit(0);
  }

  const admin = await User.create({
    preferredName: "Master Admin",
    // firstName: "Master",
    // lastName: "Admin",
    email: "admin@renterchoice.com",
    password: "RenterAdmin",
    role: "Admin",
  });

  console.log(`✅ Master Admin created: ${admin.email}`);
  process.exit(0);
};

createMasterAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
