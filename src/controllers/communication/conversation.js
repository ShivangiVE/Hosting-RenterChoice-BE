const Conversation = require("../../models/Communication/Conversation");
const Message = require("../../models/Communication/Message");
const User = require("../../models/User");
const WorkOrder = require("../../models/WorkOrder");
const { canChat } = require("../../utils/chatPermissions");

/**
 * CREATE or GET conversation
 * Vendor → Tenant
 * Vendor → RC
 * Tenant → RC
 */
exports.createConversation = async (req, res) => {
  try {
    const sender = req.user;
    let { receiverId, workOrderId } = req.body;

    // Vendor → RC: auto-pick RepairsTeam
    if (!receiverId && sender.role === "Vendor") {
      const rcUser = await User.findOne({ role: "RepairsTeam" }).select(
        "_id role",
      );
      if (!rcUser) {
        return res.status(404).json({ message: "Repairs Team not found" });
      }
      receiverId = rcUser._id;
    }

    const receiver = await User.findById(receiverId).select("_id role");
    if (!receiver) {
      return res.status(404).json({ message: "Receiver not found" });
    }

    // Vendor → Tenant MUST have Work Order
    if (
      sender.role === "Vendor" &&
      receiver.role === "Tenant" &&
      !workOrderId
    ) {
      return res.status(400).json({
        message: "Work Order is required to chat with Tenant",
      });
    }

    let workOrder = null;
    if (workOrderId) {
      workOrder = await WorkOrder.findById(workOrderId).select("_id");
      if (!workOrder) {
        return res.status(404).json({
          message: "Work Order not found",
        });
      }
    }

    //  Permission check
    if (!canChat(sender.role, receiver.role)) {
      return res.status(403).json({
        message: "You are not allowed to start this chat",
      });
    }

    //  Reuse existing direct conversation (Vendor ↔ RC)
    let conversation = await Conversation.findOne({
      participants: { $all: [sender._id, receiver._id] },
      type: "support",
      workOrder: workOrderId || null,
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [sender._id, receiver._id],
        type: "support",
        workOrder: workOrderId || null,
      });
    }

    return res.status(200).json({
      success: true,
      conversation,
    });
  } catch (err) {
    console.error("Create conversation error:", err);
    res.status(500).json({ message: "Failed to create conversation" });
  }
};

/**
 * GET user's conversations (chat list)
 */
exports.getConversations = async (req, res) => {
  try {
    const userId = req.user._id;

    const conversations = await Conversation.find({
      participants: userId,
      lastMessage: { $ne: null },
    })
      .populate("participants", "preferredName role profileImage")
      .populate({
        path: "workOrder",
        select: "workOrderNumber status building",
        populate: {
          path: "building",
          select: "formData.address",
        },
      })
      .populate({
        path: "lastMessage",
        populate: { path: "sender", select: "preferredName role" },
      })
      .sort({ updatedAt: -1 });

    res.json({
      success: true,
      conversations,
    });
  } catch (err) {
    console.error("Get conversations error:", err);
    res.status(500).json({ message: "Failed to load conversations" });
  }
};


/**
 * GET Conversation by Work Order
 */
exports.getConversationByWorkOrder = async (req, res) => {
  try {
    const { workOrderId } = req.params;
    const userId = req.user._id;

    const conversation = await Conversation.findOne({
      workOrder: workOrderId,
      participants: userId,
    })
      .populate("participants", "preferredName role profileImage")
      .populate("lastMessage");

    if (!conversation) {
      return res.json({ success: true, conversation: null });
    }

    return res.json({ success: true, conversation });
  } catch (err) {
    return res.status(500).json({ message: "Failed to load conversation" });
  }
};

/**
 * GET messages for a conversation (history)
 */
exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // 🔐 Ensure user is participant
    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const messages = await Message.find({
      conversation: conversationId,
    })
      .populate("sender", "preferredName role profileImage")
      .sort({ createdAt: 1 });

    res.json({
      success: true,
      messages,
    });
  } catch (err) {
    console.error("Get messages error:", err);
    res.status(500).json({ message: "Failed to load messages" });
  }
};
