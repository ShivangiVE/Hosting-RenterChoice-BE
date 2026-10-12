const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");
const {
  createInternalUser,
  getInternalUsers,
  deleteInternalUser,
  updateInternalUserRole,
  toggleUserStatus,
  getInternalUserDetail,
  updateInternalUser,
} = require("../controllers/officeAdmin/officeAdminController");
const { INTERNAL_ROLES } = require("../constants/roles");

const TEAM_MANAGER_ROLES = ["Admin", "BrokerageAdmin", "OfficeAdmin"];

// Allow both Admin and OfficeAdmin
router.use(protect, authorize(...INTERNAL_ROLES));

// Create a new internal user (team member)
router.post("/internal-users", createInternalUser);

// Get all internal users
router.get("/team-users", getInternalUsers);

// Single team member (Settings → My Team → details panel)
router.get(
  "/internal-users/:id",
  authorize(...TEAM_MANAGER_ROLES),
  getInternalUserDetail,
);

router.patch(
  "/internal-users/:id",
  authorize(...TEAM_MANAGER_ROLES),
  updateInternalUser,
);

router.patch(
  "/users/:userId/toggle-status",
  authorize(...TEAM_MANAGER_ROLES),
  toggleUserStatus,
);

// Delete internal user
router.delete("/internal-users/:id", deleteInternalUser);

// Update internal user role
router.put("/internal-users/:id/role", updateInternalUserRole);

module.exports = router;
