const Todo = require("../../models/tasks/Todo");
const User = require("../../models/User");
const Category = require("../../models/repairCategories");
const { sendSuccess, sendError } = require("../../utils/response");
const Counter = require("../../utils/Counter");

//  Increment (used only when creating)
const getNextSequence = async (sequenceName) => {
  const counter = await Counter.findByIdAndUpdate(
    sequenceName,
    { $inc: { sequence_value: 1 } },
    { new: true, upsert: true }
  );
  return counter.sequence_value;
};

//  Peek (used when previewing in modal, no increment)
const peekNextSequence = async (sequenceName) => {
  const counter = await Counter.findById(sequenceName);
  return counter ? counter.sequence_value + 1 : 1;
};

const formatSequence = (prefix, number) => {
  return `${prefix} #${number.toString().padStart(4, "0")}`;
};

// ------------------ Peek Todo Number ------------------
exports.getNextTodoNumber = async (req, res) => {
  try {
    const nextNumber = await peekNextSequence("todo"); // no increment
    return sendSuccess(res, "Next todo number fetched successfully", {
      nextNumber: formatSequence("TODO", nextNumber),
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch todo counter", 500);
  }
};

// CREATE Todo
exports.createTodo = async (req, res) => {
  try {
    const { category, description, tags, assignedTo, taskColor } = req.body;

    const categoryDoc = await Category.findOne({ _id: category, type: "todo" });
    if (!categoryDoc) {
      return sendError(res, "Invalid category. Must be a todo category.", 400);
    }

    if (assignedTo) {
      const assignedUser = await User.findById(assignedTo);
      if (!assignedUser) {
        return sendError(res, "Invalid assigned user. User not found.", 400);
      }
    }

    let attachments = [];
    if (req.files?.length) {
      attachments = req.files.map((file) => ({
        fileName: file.originalname,
        fileUrl: `/uploads/Repair/todos/${file.filename}`,
        fileType: file.mimetype.startsWith("image")
          ? "image"
          : file.mimetype.startsWith("video")
          ? "video"
          : "document",
      }));
    }

    // Get next todo number
    const nextNumber = await getNextSequence("todo");
    const todoNumber = `TODO #${nextNumber.toString().padStart(4, "0")}`;

    const todo = await Todo.create({
      todoNumber,
      category,
      description,
      tags,
      assignedTo,
      taskColor: taskColor || undefined,
      attachments,
      status: "In Progress",
      createdBy: req.user._id,
    });

    return sendSuccess(res, "Todo created successfully", { todo }, 201);
  } catch (err) {
    return sendError(res, err.message || "Failed to create todo", 500);
  }
};

// GET Todos
exports.getTodos = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { category, assignedTo, tags, taskColor, status } = req.query;

    let filter = {};
    if (category) filter.category = category;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (taskColor) filter.taskColor = taskColor;
    if (tags) filter.tags = { $in: tags.split(",") };
    if (status) filter.status = status;

    const [todos, total] = await Promise.all([
      Todo.find(filter)
        .populate("category", "name")
        .populate("assignedTo", "preferredName email")
        .populate("createdBy", "preferredName email")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      Todo.countDocuments(filter),
    ]);

    // Map todos to include fallback if user or category missing
    const mappedTodos = todos.map((todo) => ({
      ...todo.toObject(),
      assignedTo: todo.assignedTo
        ? todo.assignedTo
        : { preferredName: "", email: "" },
      createdBy: todo.createdBy
        ? todo.createdBy
        : { preferredName: "", email: "" },
      category: todo.category ? todo.category : { name: "" },
    }));

    return sendSuccess(res, "Todos fetched successfully", {
      todos: mappedTodos,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch todos", 500);
  }
};

// UPDATE Todo
exports.updateTodo = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (updateData.category) {
      const categoryDoc = await Category.findOne({
        _id: updateData.category,
        type: "todo",
      });
      if (!categoryDoc) {
        return sendError(
          res,
          "Invalid category. Must be a todo category.",
          400
        );
      }
    }

    if (updateData.assignedTo) {
      const assignedUser = await User.findById(updateData.assignedTo);
      if (!assignedUser) {
        return sendError(res, "Invalid assigned user. User not found.", 400);
      }
    }

    const todo = await Todo.findByIdAndUpdate(id, updateData, { new: true });
    if (!todo) return sendError(res, "Todo not found", 404);

    return sendSuccess(res, "Todo updated successfully", { todo });
  } catch (err) {
    return sendError(res, err.message || "Failed to update todo", 500);
  }
};

// CLOSE Todo
exports.closeTodo = async (req, res) => {
  try {
    const { id } = req.params;
    const { closingComments } = req.body;

    const todo = await Todo.findById(id);
    if (!todo) return sendError(res, "Todo not found", 404);

    // Ensure only creator or assigned user can close
    if (
      todo.createdBy.toString() !== req.user._id.toString() &&
      todo.assignedTo.toString() !== req.user._id.toString()
    ) {
      return sendError(res, "You are not authorized to close this todo", 403);
    }

    // Check if already closed
    if (todo.status === "Completed") {
      return sendError(res, "Todo is already closed", 400);
    }

    todo.status = "Completed";
    if (closingComments) todo.closingComments = closingComments;
    await todo.save();

    return sendSuccess(res, "Todo closed successfully", { todo });
  } catch (err) {
    return sendError(res, err.message || "Failed to close todo", 500);
  }
};

// BULK CLOSE Todos
exports.bulkCloseTodos = async (req, res) => {
  try {
    const { todoIds } = req.body;

    if (!todoIds || !Array.isArray(todoIds) || !todoIds.length) {
      return sendError(res, "No todos selected for bulk close", 400);
    }

    const todos = await Todo.find({ _id: { $in: todoIds } });
    const results = [];

    for (const todo of todos) {
      // Security check: only creator or assigned user can close
      if (
        todo.createdBy.toString() !== req.user._id.toString() &&
        todo.assignedTo.toString() !== req.user._id.toString()
      ) {
        results.push({
          todoId: todo._id,
          status: "failed",
          message: "Not authorized to close",
        });
        continue;
      }

      if (todo.status === "Completed") {
        results.push({
          todoId: todo._id,
          status: "failed",
          message: "Todo already closed",
        });
        continue;
      }

      todo.status = "Completed";
      // Add note instead of closingComments
      todo.closingComments =
        "Note: To add comments, please close todos individually.";
      await todo.save();

      results.push({
        todoId: todo._id,
        status: "success",
        message: "Todo closed successfully",
      });
    }

    return sendSuccess(res, "Bulk close operation completed", { results });
  } catch (err) {
    return sendError(res, err.message || "Failed to bulk close todos", 500);
  }
};

// DELETE Todo
exports.deleteTodo = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the todo first
    const todo = await Todo.findById(id);
    if (!todo) return sendError(res, "Todo not found", 404);

    // Check if the logged-in user is the creator
    if (todo.createdBy.toString() !== req.user._id.toString()) {
      return sendError(res, "You are not authorized to delete this todo", 403);
    }

    // Delete todo
    await Todo.findByIdAndDelete(id);
    return sendSuccess(res, "Todo deleted successfully");
  } catch (err) {
    return sendError(res, err.message || "Failed to delete todo", 500);
  }
};

// BULK DELETE Todos
exports.bulkDeleteTodos = async (req, res) => {
  try {
    const { todoIds } = req.body;
    if (!todoIds || !Array.isArray(todoIds) || !todoIds.length) {
      return sendError(res, "No todos selected for bulk delete", 400);
    }

    const todos = await Todo.find({ _id: { $in: todoIds } });

    const results = [];

    for (const todo of todos) {
      // Security check: only creator can delete
      if (todo.createdBy.toString() !== req.user._id.toString()) {
        results.push({
          todoId: todo._id,
          status: "failed",
          message: "Not authorized to delete",
        });
        continue;
      }

      await Todo.findByIdAndDelete(todo._id);
      results.push({
        todoId: todo._id,
        status: "success",
        message: "Todo deleted successfully",
      });
    }

    return sendSuccess(res, "Bulk delete operation completed", { results });
  } catch (err) {
    return sendError(res, err.message || "Failed to bulk delete todos", 500);
  }
};
