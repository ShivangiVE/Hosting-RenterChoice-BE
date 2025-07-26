const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");
const {
  getAllUsers,
  deleteUser,
  updateUserRole,
  createInternalUser,
  createOfficeAdmin,
} = require("../controllers/admin/adminController");

// All routes protected AND only for Admin
router.use(protect, authorize("Admin"));

// Dedicated OfficeAdmin route
router.post("/create-office-admin", createOfficeAdmin);

// Generic internal team creation
router.post("/create-internal", createInternalUser);

router.get("/users", getAllUsers);
router.delete("/users/:id", deleteUser);
router.put("/users/:id/role", updateUserRole);

module.exports = router;
