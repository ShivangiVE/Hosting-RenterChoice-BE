const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");
const {
  getAllUsers,
  deleteUser,
  updateUserRole,
  createInternalUser,
  createOfficeAdmin,
  getOfficeAdmins,
  getTeamsGroupedByOfficeAdmin,
  impersonateOfficeAdmin,
} = require("../controllers/admin/adminController");

// All routes protected AND only for Admin
router.use(protect, authorize("Admin"));

// Dedicated OfficeAdmin route
router.post("/create-office-admin", authorize("Admin"), createOfficeAdmin);

// Generic internal team creation
router.post("/create-internal", createInternalUser);

router.get("/users", getAllUsers);

//Get Office Admins
router.get("/office-admins", getOfficeAdmins);

//Get Users as per office admin team
router.get("/teams-by-office-admin", getTeamsGroupedByOfficeAdmin);

//Logged in as office Admin
router.post("/impersonate/:officeAdminId", impersonateOfficeAdmin);

router.delete("/users/:id", deleteUser);
router.put("/users/:id/role", updateUserRole);

module.exports = router;
