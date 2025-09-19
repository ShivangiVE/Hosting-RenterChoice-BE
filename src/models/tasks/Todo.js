const mongoose = require("mongoose");

const todoSchema = new mongoose.Schema(
  {
    todoNumber: { type: String, unique: true },
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
      required: true, // can assign to self or others
    },

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

module.exports = mongoose.model("Todo", todoSchema);
