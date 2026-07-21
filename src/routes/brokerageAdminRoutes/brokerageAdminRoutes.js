const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../../middleware/authMiddleware");

const {
  createOfficeAdmin,
  getMyOfficeAdmins,
  getMyTeamsGrouped,
  impersonateOfficeAdmin,
  deleteOfficeAdmin,
  getOfficeAdminTeam,
  deleteTeamMember,
  toggleUserStatus,
  createBrokerageStaff,
  getMyBrokerageStaff,
  toggleBrokerageStaffStatus,
  deleteBrokerageStaff,
} = require("../../controllers/brokerageAdmin/brokerageAdminController");

// All routes: authenticated + BrokerageAdmin only
router.use(protect, authorize("BrokerageAdmin"));

router.post("/office-admins", createOfficeAdmin);
router.post("/brokerage-staff", createBrokerageStaff);
router.get("/office-admins", getMyOfficeAdmins);
router.get("/brokerage-staff", getMyBrokerageStaff);
router.get("/office-admins/:officeAdminId/team", getOfficeAdminTeam);
router.get("/teams", getMyTeamsGrouped);
router.post("/impersonate/:officeAdminId", impersonateOfficeAdmin);
router.patch("/users/:userId/toggle-status", toggleUserStatus);
router.patch("/brokerage-staff/:id/toggle-status", toggleBrokerageStaffStatus);
router.delete("/office-admins/:id", deleteOfficeAdmin);
router.delete("/brokerage-staff/:id", deleteBrokerageStaff);
router.delete("/team-members/:memberId", deleteTeamMember);

module.exports = router;
