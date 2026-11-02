const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../../middleware/authMiddleware");
const {
  createTeam,
  getBrokerages,
  getMyBrokerage,
  resendTeamAdminInvite,
  getBrokerageStructure,
  getMyBrokerageStructure,
} = require("../../controllers/team/teamController");

router.use(protect);

// Master Admin only — brokerage dropdown
router.get("/brokerages", authorize("Admin"), getBrokerages);

// Master Admin only — Office Locations: brokerage → expansions → members
router.get(
  "/brokerages/:id/structure",
  authorize("Admin"),
  getBrokerageStructure,
);

// Brokerage Admin only — the brokerage their new teams go under
router.get("/my-brokerage", authorize("BrokerageAdmin"), getMyBrokerage);

router.get(
  "/my-brokerage/structure",
  authorize("BrokerageAdmin"),
  getMyBrokerageStructure,
);

// Both roles — the controller decides what each role may create
router.post("/", authorize("Admin", "BrokerageAdmin"), createTeam);
router.post(
  "/:id/resend-invite",
  authorize("Admin", "BrokerageAdmin"),
  resendTeamAdminInvite,
);

module.exports = router;
