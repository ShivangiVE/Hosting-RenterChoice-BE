const Message = require("../../models/Communication/Message");
const Conversation = require("../../models/Communication/Conversation");
const { getIO } = require("../../../socket");
const { canSendMessage } = require("../../domain/chatPolicy");
const WorkOrder = require("../../models/WorkOrder");
const User = require("../../models/User");

/**
 * SEND MESSAGE (HTTP)
 * Vendor / RepairsTeam / Tenant
 */
exports.sendMessage = async (req, res) => {
  try {
    const sender = req.user;
    const { conversationId, content } = req.body;

    if (!conversationId || !content) {
      return res.status(400).json({
        message: "conversationId and content are required",
      });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    //  Ensure sender is part of conversation
    if (!conversation.participants.includes(sender._id)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    /**
     *  CHAT POLICY (same as socket)
     * Block Tenant chat after WO closed
     * Allow RC chat even after closure
     */
    if (conversation.workOrder) {
      const wo = await WorkOrder.findById(conversation.workOrder).select(
        "status",
      );

      const receiverRoles = await User.find({
        _id: {
          $in: conversation.participants,
          $ne: sender._id,
        },
      }).distinct("role");

      const allowed = canSendMessage({
        senderRole: sender.role,
        receiverRoles,
        workOrderStatus: wo?.status || null,
      });

      if (!allowed) {
        return res.status(403).json({
          message:
            "Chat with tenant is disabled after work order closure. RC chat is allowed.",
        });
      }
    }

    // Create message
    const message = await Message.create({
      conversation: conversationId,
      sender: sender._id,
      content,
    });

    // update last message
    conversation.lastMessage = message._id;
    await conversation.save();

    // EMIT REALTIME EVENT
    getIO().to(`conversation:${conversationId}`).emit("new_message", message);

    return res.status(201).json({
      success: true,
      message,
    });
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ message: "Failed to send message" });
  }
};
