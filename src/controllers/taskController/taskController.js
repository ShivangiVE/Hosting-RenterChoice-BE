const Task = require("../../models/tasks/Task");
const User = require("../../models/User");
const Category = require("../../models/repairCategories");
const { sendSuccess, sendError } = require("../../utils/response");
const Counter = require("../../utils/Counter");

// Increment counter
const getNextSequence = async (sequenceName) => {
  const counter = await Counter.findByIdAndUpdate(
    sequenceName,
    { $inc: { sequence_value: 1 } },
    { new: true, upsert: true }
  );
  return counter.sequence_value;
};

// Peek counter (no increment)
const peekNextSequence = async (sequenceName) => {
  const counter = await Counter.findById(sequenceName);
  return counter ? counter.sequence_value + 1 : 1;
};

const formatSequence = (prefix, number) => {
  return `${prefix} #${number.toString().padStart(4, "0")}`;
};

// ------------------ Peek Task Number ------------------
exports.getNextTaskNumber = async (req, res) => {
  try {
    const nextNumber = await peekNextSequence("task");
    return sendSuccess(res, "Next task number fetched successfully", {
      nextNumber: formatSequence("TASK", nextNumber),
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch task counter", 500);
  }
};

// CREATE Task
exports.createTask = async (req, res) => {
  try {
    const { category, description, tags, assignedTo, dueDate, taskColor } =
      req.body;

    // Validate category
    const categoryDoc = await Category.findOne({ _id: category, type: "task" });
    if (!categoryDoc) {
      return sendError(res, "Invalid category. Must be a task category.", 400);
    }

    // Validate assigned user
    const assignedUser = await User.findById(assignedTo);
    if (!assignedUser) {
      return sendError(res, "Invalid assigned user. User not found.", 400);
    }

    // File attachments
    let attachments = [];
    if (req.files?.length) {
      attachments = req.files.map((file) => ({
        fileName: file.originalname,
        fileUrl: `/uploads/Repair/tasks/${file.filename}`,
        fileType: file.mimetype.startsWith("image")
          ? "image"
          : file.mimetype.startsWith("video")
          ? "video"
          : "document",
      }));
    }

    const sequence = await getNextSequence("task");
    const taskNumber = `TASK #${sequence.toString().padStart(4, "0")}`;

    const task = await Task.create({
      taskNumber,
      category,
      description,
      tags,
      assignedTo,
      dueDate,
      taskColor: taskColor || undefined,
      attachments,
      status: "In Progress",
      createdBy: req.user._id,
    });

    return sendSuccess(res, "Task created successfully", { task }, 201);
  } catch (err) {
    return sendError(res, err.message || "Failed to create task", 500);
  }
};

// GET All Tasks
exports.getTasks = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { category, user, assignedTo, tags, taskColor, dueDate, status, myView } =
      req.query;

    let filter = {};
    if (category) filter.category = category;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (taskColor) filter.taskColor = taskColor;
    if (tags) filter.tags = { $in: tags.split(",") };
    if (dueDate) {
      const start = new Date(dueDate);
      start.setHours(0, 0, 0, 0);

      const end = new Date(dueDate);
      end.setHours(23, 59, 59, 999);

      filter.dueDate = { $gte: start, $lte: end };
    }

    if (status) filter.status = status;

    // filter for tasks assigned to OR created by the user
    if (user) {
      filter.$or = [{ assignedTo: user }, { createdBy: user }];
    }

    // filter for tasks assigned to OR created by the user
    if (myView === "true") {
      filter.$or = [
        { createdBy: req.user._id, assignedTo: { $ne: req.user._id } },
      ];
    } else if (user) {
      filter.$or = [{ assignedTo: user }, { createdBy: user }];
    }


    const [tasks, total] = await Promise.all([
      Task.find(filter)
        .populate("category", "name")
        .populate("assignedTo", "preferredName email")
        .populate("createdBy", "preferredName email")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      Task.countDocuments(filter),
    ]);

    // Map tasks to include fallback if user missing
    const mappedTasks = tasks.map((task) => ({
      ...task.toObject(),
      assignedTo: task.assignedTo ? task.assignedTo : { name: "" },
      createdBy: task.createdBy ? task.createdBy : { name: "" },
      category: task.category ? task.category : { name: "" },
    }));

    return sendSuccess(res, "Tasks fetched successfully", {
      tasks: mappedTasks,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch tasks", 500);
  }
};

// GET Tasks by Tags (Portfolio/Building)
exports.getTasksByTags = async (req, res) => {
  try {
    const { tags, tagType, assignedTo, user } = req.query; 
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!tags || !tagType) {
      return sendError(res, "Both tags and tagType are required", 400);
    }

    // Convert single tag to array if needed
    const tagArray = Array.isArray(tags) ? tags : [tags];

    // Prefix each tag with tagType
    const prefixedTags = tagArray.map((tag) => `${tagType}:${tag}`);

    const filter = {
      tags: { $in: prefixedTags },
    };

    // Add assignedTo filter
    if (assignedTo) {
      filter.assignedTo = assignedTo;
    }

    // Add user filter (tasks assigned to OR created by the user)
    if (user) {
      filter.$or = [{ assignedTo: user }, { createdBy: user }];
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const [tasks, total] = await Promise.all([
      Task.find(filter)
        .populate("category", "name")
        .populate("assignedTo", "preferredName email")
        .populate("createdBy", "preferredName email")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      Task.countDocuments(filter),
    ]);

    const mappedTasks = tasks.map((task) => ({
      ...task.toObject(),
      assignedTo: task.assignedTo || { preferredName: "", email: "" },
      createdBy: task.createdBy || { preferredName: "", email: "" },
      category: task.category || { name: "" },
    }));

    return sendSuccess(res, "Tasks fetched successfully", {
      tasks: mappedTasks,
      total,
      page,
      pages: Math.ceil(total / limit),
      filterInfo: {
        tagType,
        matchedTags: prefixedTags,
      },
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch tasks by tags", 500);
  }
};

// GET Task Details by ID
exports.getTaskDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const task = await Task.findById(id)
      .populate("category", "name")
      .populate("assignedTo", "preferredName email")
      .populate("createdBy", "preferredName email");

    if (!task) return sendError(res, "Task not found", 404);

    // Map to include fallbacks
    const mappedTask = {
      ...task.toObject(),
      assignedTo: task.assignedTo
        ? task.assignedTo
        : { preferredName: "", email: "" },
      createdBy: task.createdBy
        ? task.createdBy
        : { preferredName: "", email: "" },
      category: task.category ? task.category : { name: "" },
    };

    return sendSuccess(res, "Task details fetched successfully", mappedTask);
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch task details", 500);
  }
};

// UPDATE Task
exports.updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Handle category validation
    if (updateData.category) {
      const categoryDoc = await Category.findOne({
        _id: updateData.category,
        type: "task",
      });
      if (!categoryDoc) {
        return sendError(
          res,
          "Invalid category. Must be a task category.",
          400
        );
      }
    }

    // Handle assigned user validation
    if (updateData.assignedTo) {
      const assignedUser = await User.findById(updateData.assignedTo);
      if (!assignedUser) {
        return sendError(res, "Invalid assigned user. User not found.", 400);
      }
    }

    // Get existing task to preserve attachments
    const existingTask = await Task.findById(id);
    if (!existingTask) {
      return sendError(res, "Task not found", 404);
    }

    // Handle file attachments
    let attachments = [];

    // Handle existing attachments - only keep those specified
    if (
      updateData.existingAttachments &&
      Array.isArray(updateData.existingAttachments)
    ) {
      // Filter existing attachments to keep only those in existingAttachments array
      attachments = existingTask.attachments.filter((att) =>
        updateData.existingAttachments.includes(att.fileUrl)
      );
    }

    // Add new uploaded files
    if (req.files && req.files.length > 0) {
      const newAttachments = req.files.map((file) => ({
        fileName: file.originalname,
        fileUrl: `/uploads/Repair/tasks/${file.filename}`,
        fileType: file.mimetype.startsWith("image")
          ? "image"
          : file.mimetype.startsWith("video")
          ? "video"
          : "document",
      }));

      attachments = [...attachments, ...newAttachments];
    }

    // Update the attachments
    updateData.attachments = attachments;

    // Remove existingAttachments from updateData as it's not a schema field
    delete updateData.existingAttachments;

    const task = await Task.findByIdAndUpdate(id, updateData, { new: true })
      .populate("category", "name")
      .populate("assignedTo", "preferredName email")
      .populate("createdBy", "preferredName email");

    return sendSuccess(res, "Task updated successfully", { task });
  } catch (err) {
    console.error("Update task error:", err);
    return sendError(res, err.message || "Failed to update task", 500);
  }
};

// CLOSE Task
exports.closeTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { closingComments } = req.body;

    const task = await Task.findById(id);
    if (!task) return sendError(res, "Task not found", 404);

    // Ensure only creator or assigned user can close
    if (
      task.createdBy.toString() !== req.user._id.toString() &&
      task.assignedTo.toString() !== req.user._id.toString()
    ) {
      return sendError(res, "You are not authorized to close this task", 403);
    }

    // Check if already closed
    if (task.status === "Completed") {
      return sendError(res, "Task is already closed", 400);
    }

    task.status = "Completed";
    task.completedAt = new Date();
    if (closingComments) task.closingComments = closingComments;
    await task.save();

    return sendSuccess(res, "Task closed successfully", { task });
  } catch (err) {
    return sendError(res, err.message || "Failed to close task", 500);
  }
};

// BULK CLOSE Tasks
exports.bulkCloseTasks = async (req, res) => {
  try {
    const { taskIds } = req.body;

    if (!taskIds || !Array.isArray(taskIds) || !taskIds.length) {
      return sendError(res, "No tasks selected for bulk close", 400);
    }

    const tasks = await Task.find({ _id: { $in: taskIds } });
    const results = [];

    for (const task of tasks) {
      if (
        task.createdBy.toString() !== req.user._id.toString() &&
        task.assignedTo.toString() !== req.user._id.toString()
      ) {
        results.push({
          taskId: task._id,
          status: "failed",
          message: "Not authorized to close",
        });
        continue;
      }

      if (task.status === "Completed") {
        results.push({
          taskId: task._id,
          status: "failed",
          message: "Task already closed",
        });
        continue;
      }

      task.status = "Completed";
      task.completedAt = new Date();
      task.closingComments =
        "Note: To add comments, please close tasks individually.";
      await task.save();

      results.push({
        taskId: task._id,
        status: "success",
        message: "Task closed successfully",
      });
    }

    return sendSuccess(res, "Bulk close operation completed", { results });
  } catch (err) {
    return sendError(res, err.message || "Failed to bulk close tasks", 500);
  }
};

// DELETE Task
exports.deleteTask = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the task first
    const task = await Task.findById(id);
    if (!task) return sendError(res, "Task not found", 404);

    // Check if the logged-in user is the creator
    if (task.createdBy.toString() !== req.user._id.toString()) {
      return sendError(res, "You are not authorized to delete this task", 403);
    }

    // Delete task
    await Task.findByIdAndDelete(id);
    return sendSuccess(res, "Task deleted successfully");
  } catch (err) {
    return sendError(res, err.message || "Failed to delete task", 500);
  }
};

// BULK DELETE Tasks
exports.bulkDeleteTasks = async (req, res) => {
  try {
    const { taskIds } = req.body;
    if (!taskIds || !Array.isArray(taskIds) || !taskIds.length) {
      return sendError(res, "No tasks selected for bulk delete", 400);
    }

    const tasks = await Task.find({ _id: { $in: taskIds } });

    const results = [];

    for (const task of tasks) {
      // Security check: only creator can delete
      if (task.createdBy.toString() !== req.user._id.toString()) {
        results.push({
          taskId: task._id,
          status: "failed",
          message: "Not authorized to delete",
        });
        continue;
      }

      await Task.findByIdAndDelete(task._id);
      results.push({
        taskId: task._id,
        status: "success",
        message: "Task deleted successfully",
      });
    }

    return sendSuccess(res, "Bulk delete operation completed", { results });
  } catch (err) {
    return sendError(res, err.message || "Failed to bulk delete tasks", 500);
  }
};
