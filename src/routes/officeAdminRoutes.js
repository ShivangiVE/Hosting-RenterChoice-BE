const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");
const {
  createInternalUser,
  getInternalUsers,
  deleteInternalUser,
  updateInternalUserRole,
} = require("../controllers/officeAdmin/officeAdminController");

// Allow both Admin and OfficeAdmin
router.use(protect, authorize("Admin", "OfficeAdmin"));

// Create a new internal user (team member)
router.post("/internal-users", createInternalUser);

// Get all internal users
router.get("/team-users", getInternalUsers);

// Delete internal user
router.delete("/internal-users/:id", deleteInternalUser);

// Update internal user role
router.put("/internal-users/:id/role", updateInternalUserRole);

module.exports = router;
