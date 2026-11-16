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
  createBrokerageAdmin,
  getBrokerageAdmins,
  toggleUserStatus,
  getUserStatusLogs,
  getLoginAsTargets,
  updateSupportContact,
  getTeamUserProfile,
  updateTeamUserProfile,
} = require("../controllers/admin/adminController");

// All routes protected AND only for Admin
router.use(protect, authorize("Admin"));

router.post(
  "/create-brokerage-admin",
  authorize("Admin"),
  createBrokerageAdmin,
);

// Dedicated OfficeAdmin route
router.post("/create-office-admin", authorize("Admin"), createOfficeAdmin);

// Generic internal team creation
router.post("/create-internal", createInternalUser);

router.get("/brokerage-admins", authorize("Admin"), getBrokerageAdmins);

router.get("/users", getAllUsers);

//Get Office Admins
router.get("/office-admins", authorize("Admin"), getOfficeAdmins);

// Login As list: brokerages → brokerage admin + teams → team admins
router.get("/login-as-targets", getLoginAsTargets);

//Get Users as per office admin team
router.get("/teams-by-office-admin", getTeamsGroupedByOfficeAdmin);

//Logged in as office Admin
router.post("/impersonate/:officeAdminId", impersonateOfficeAdmin);

router.patch("/users/:userId/toggle-status", toggleUserStatus);
// Edit team user (Brokerage Locations): name + LPM
router.get("/users/:id/profile", getTeamUserProfile);
router.patch("/users/:id/profile", updateTeamUserProfile);

router.get("/users/:userId/status-logs", getUserStatusLogs);

router.delete("/users/:id", deleteUser);
router.put("/users/:id/role", updateUserRole);
router.put("/support-contact", updateSupportContact);

module.exports = router;
