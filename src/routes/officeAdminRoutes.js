const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");
const {
  createInternalUser,
  getInternalUsers,
  deleteInternalUser,
  updateInternalUserRole,
} = require("../controllers/officeAdmin/officeAdminController");
const { INTERNAL_ROLES } = require("../constants/roles");

// Allow both Admin and OfficeAdmin
router.use(protect, authorize(...INTERNAL_ROLES));

// Create a new internal user (team member)
router.post("/internal-users", createInternalUser);

// Get all internal users
router.get("/team-users", getInternalUsers);

// Delete internal user
router.delete("/internal-users/:id", deleteInternalUser);

// Update internal user role
router.put("/internal-users/:id/role", updateInternalUserRole);

module.exports = router;
