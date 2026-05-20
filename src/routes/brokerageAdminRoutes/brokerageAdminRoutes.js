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
} = require("../../controllers/brokerageAdmin/brokerageAdminController");

// All routes: authenticated + BrokerageAdmin only
router.use(protect, authorize("BrokerageAdmin"));

router.post("/office-admins", createOfficeAdmin);
router.get("/office-admins", getMyOfficeAdmins);
router.get("/office-admins/:officeAdminId/team", getOfficeAdminTeam);
router.get("/teams", getMyTeamsGrouped);
router.post("/impersonate/:officeAdminId", impersonateOfficeAdmin);
router.delete("/office-admins/:id", deleteOfficeAdmin);
router.delete("/team-members/:memberId", deleteTeamMember);

module.exports = router;
