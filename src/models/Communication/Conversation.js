const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    type: {
      type: String,
      enum: ["direct", "group", "support"],
      default: "direct",
    },
    workOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkOrder",
      default: null,
    },
    serviceAgreement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceAgreement",
      default: null,
    },
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Conversation", conversationSchema);
