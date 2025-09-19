const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    taskNumber: { type: String, unique: true },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    description: { type: String, required: true },

    tags: [{ type: String }], // multiple tags from dropdown

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    dueDate: { type: Date, required: true },

    taskColor: {
      type: String,
      enum: ["Red", "Green", "Blue", "Yellow", "Purple"],
      // required: true,
    },

    attachments: [
      {
        fileName: String,
        fileUrl: String,
        fileType: {
          type: String,
          enum: ["image", "video", "document"],
        },
      },
    ],

    status: {
      type: String,
      enum: ["In Progress", "Completed"],
      default: "In Progress",
    },

    closingComments: {
      type: String,
    },
    completedAt: { type: Date },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Task", taskSchema);
