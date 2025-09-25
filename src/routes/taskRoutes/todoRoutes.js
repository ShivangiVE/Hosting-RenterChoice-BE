const express = require("express");
const router = express.Router();
const {
  createTodo,
  getTodos,
  updateTodo,
  deleteTodo,
  getNextTodoNumber,
  closeTodo,
  bulkCloseTodos,
  bulkDeleteTodos,
  getTodoDetails,
} = require("../../controllers/taskController/todoController");
const { protect, authorize } = require("../../middleware/authMiddleware");
const { todoUpload } = require("../../middleware/repairUpload");

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

// Create Todo
router.post(
  "/create",
  protect,
  authorize(...ALLOWED_ROLES),
  todoUpload.array("attachments"),
  createTodo
);

// Get Todos
router.get("/", protect, getTodos);

// Get Todo details
router.get("/:id", protect, authorize(...ALLOWED_ROLES), getTodoDetails);

// Update Todo
router.put(
  "/:id",
  protect,
  authorize(...ALLOWED_ROLES),
  todoUpload.array("attachments"),
  updateTodo
);
// Close Todo
router.put("/:id/close", protect, authorize(...ALLOWED_ROLES), closeTodo);

// Bulk Close Todos
router.post(
  "/bulk-close",
  protect,
  authorize(...ALLOWED_ROLES),
  bulkCloseTodos
);

// Delete Todo
router.delete("/:id", protect, authorize(...ALLOWED_ROLES), deleteTodo);

// Bulk Delete Todos
router.post(
  "/bulk-delete",
  protect,
  authorize(...ALLOWED_ROLES),
  bulkDeleteTodos
);

// ========================= Counter =========================
router.get(
  "/counter/:type",
  protect,
  authorize(...ALLOWED_ROLES),
  getNextTodoNumber
);

module.exports = router;
