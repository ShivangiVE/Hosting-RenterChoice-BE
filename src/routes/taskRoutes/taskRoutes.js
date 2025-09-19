const express = require("express");
const router = express.Router();

const {
  getTasks,
  updateTask,
  deleteTask,
  createTask,
  getNextTaskNumber,
  closeTask,
  bulkCloseTasks,
  bulkDeleteTasks,
} = require("../../controllers/taskController/taskController");
const { protect, authorize } = require("../../middleware/authMiddleware");
const { taskUpload } = require("../../middleware/repairUpload");

const ALLOWED_ROLES = [
  "Admin",
  "OfficeAdmin",
  "AccountsTeam",
  "RepairsTeam",
  "LeaseTeam",
  "MarketingTeam",
  "LandlordsTeam",
  "InspectionClerk",
];

// Create Task
router.post(
  "/create",
  protect,
  authorize(...ALLOWED_ROLES),
  taskUpload.array("attachments"),
  createTask
);

// Get tasks with filters + pagination
router.get("/", protect, getTasks);

// Update Task
router.put("/:id", protect, authorize(...ALLOWED_ROLES), updateTask);

// Close Task
router.put("/:id/close", protect, authorize(...ALLOWED_ROLES), closeTask);

// Bulk Close Tasks
router.post(
  "/bulk-close",
  protect,
  authorize(...ALLOWED_ROLES),
  bulkCloseTasks
);

// Delete Task
router.delete("/:id", protect, authorize(...ALLOWED_ROLES), deleteTask);

// Bulk Delete Tasks
router.post(
  "/bulk-delete",
  protect,
  authorize(...ALLOWED_ROLES),
  bulkDeleteTasks
);

// ========================= Counter =========================
router.get(
  "/counter/:type",
  protect,
  authorize(...ALLOWED_ROLES),
  getNextTaskNumber
);

module.exports = router;
