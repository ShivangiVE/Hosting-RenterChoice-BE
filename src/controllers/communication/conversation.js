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
// exports.createConversation = async (req, res) => {
//   try {
//     const sender = req.user;
//     let { receiverId, workOrderId } = req.body;

//     // Vendor → RC: auto-pick RepairsTeam
//     if (!receiverId && sender.role === "Vendor") {
//       const rcUser = await User.findOne({ role: "RepairsTeam" }).select(
//         "_id role",
//       );
//       if (!rcUser) {
//         return res.status(404).json({ message: "Repairs Team not found" });
//       }
//       receiverId = rcUser._id;
//     }

//     const receiver = await User.findById(receiverId).select("_id role");
//     if (!receiver) {
//       return res.status(404).json({ message: "Receiver not found" });
//     }

//     // Vendor → Tenant MUST have Work Order
//     if (
//       sender.role === "Vendor" &&
//       receiver.role === "Tenant" &&
//       !workOrderId
//     ) {
//       return res.status(400).json({
//         message: "Work Order is required to chat with Tenant",
//       });
//     }

//     let workOrder = null;
//     if (workOrderId) {
//       workOrder = await WorkOrder.findById(workOrderId).select("_id");
//       if (!workOrder) {
//         return res.status(404).json({
//           message: "Work Order not found",
//         });
//       }
//     }

//     //  Permission check
//     if (!canChat(sender.role, receiver.role)) {
//       return res.status(403).json({
//         message: "You are not allowed to start this chat",
//       });
//     }

//     //  Reuse existing direct conversation (Vendor ↔ RC)
//     let conversation = await Conversation.findOne({
//       participants: { $all: [sender._id, receiver._id] },
//       type: "support",
//       workOrder: workOrderId || null,
//     });

//     if (!conversation) {
//       conversation = await Conversation.create({
//         participants: [sender._id, receiver._id],
//         type: "support",
//         workOrder: workOrderId || null,
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       conversation,
//     });
//   } catch (err) {
//     console.error("Create conversation error:", err);
//     res.status(500).json({ message: "Failed to create conversation" });
//   }
// };

// src/controllers/communication/conversation.js

/**
 * CREATE or GET conversation
 * - Vendor → ALL RepairsTeam members (GROUP)
 * - Vendor → Tenant (direct, requires workOrder)
 * - Tenant → RC (can be group or assigned member)
 */
exports.createConversation = async (req, res) => {
  try {
    const sender = req.user;
    let { receiverId, workOrderId } = req.body;

    // ========================================
    // CASE 1: Vendor starting chat
    // ========================================
    if (sender.role === "Vendor") {
      // If chatting with Tenant, must have workOrderId
      if (receiverId) {
        const receiver = await User.findById(receiverId).select("_id role");

        if (!receiver) {
          return res.status(404).json({ message: "Receiver not found" });
        }

        if (receiver.role === "Tenant" && !workOrderId) {
          return res.status(400).json({
            message: "Work Order is required to chat with Tenant",
          });
        }

        // Direct chat with specific person (e.g., Tenant)
        let conversation = await Conversation.findOne({
          participants: { $all: [sender._id, receiver._id] },
          workOrder: workOrderId || null,
        });

        if (!conversation) {
          conversation = await Conversation.create({
            participants: [sender._id, receiver._id],
            type: "direct",
            workOrder: workOrderId || null,
          });
        }

        return res.status(200).json({
          success: true,
          conversation,
        });
      }

      // ========================================
      // VENDOR → REPAIRS TEAM (GROUP CHAT)
      // ========================================

      // Find ALL repair team members
      const repairTeamMembers = await User.find({
        role: "RepairsTeam",
        // Optional: Add filters for active/enabled users
        // isActive: true
      }).select("_id role");

      if (repairTeamMembers.length === 0) {
        return res.status(404).json({
          message: "No Repairs Team members found",
        });
      }

      // ADD: Find all Admin users to include them
      const adminUsers = await User.find({
        role: "Admin",
      }).select("_id role");

      const allParticipantIds = [
        sender._id,
        ...repairTeamMembers.map((m) => m._id),
        ...adminUsers.map((a) => a._id),
      ];

      // Check if group conversation already exists for this work order
      let conversation = await Conversation.findOne({
        type: "group",
        workOrder: workOrderId || null,
        participants: { $all: [sender._id] },
      });

      if (conversation) {
        const currentParticipants = conversation.participants.map((p) =>
          p.toString(),
        );
        const newParticipants = allParticipantIds.filter(
          (id) => !currentParticipants.includes(id.toString()),
        );

        if (newParticipants.length > 0) {
          conversation.participants = allParticipantIds;
          await conversation.save();
        }
      } else {
        // Create new group conversation
        conversation = await Conversation.create({
          participants: allParticipantIds,
          type: "group",
          workOrder: workOrderId || null,
        });
      }

      return res.status(200).json({
        success: true,
        conversation,
      });
    }

    // ========================================
    // CASE 2: Other roles (Tenant, RC, etc.)
    // ========================================

    if (!receiverId) {
      return res.status(400).json({
        message: "Receiver ID is required for non-vendor chats",
      });
    }

    const receiver = await User.findById(receiverId).select("_id role");
    if (!receiver) {
      return res.status(404).json({ message: "Receiver not found" });
    }

    // Validate work order if provided
    let workOrder = null;
    if (workOrderId) {
      workOrder = await WorkOrder.findById(workOrderId).select("_id");
      if (!workOrder) {
        return res.status(404).json({
          message: "Work Order not found",
        });
      }
    }

    // Permission check
    if (!canChat(sender.role, receiver.role)) {
      return res.status(403).json({
        message: "You are not allowed to start this chat",
      });
    }

    // Find or create direct conversation
    let conversation = await Conversation.findOne({
      participants: { $all: [sender._id, receiver._id] },
      type: "direct",
      workOrder: workOrderId || null,
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [sender._id, receiver._id],
        type: "direct",
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
    const { before, limit = 20 } = req.query;
    const userId = req.user._id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    //  Ensure user is participant
    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const query = { conversation: conversationId };

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .populate("sender", "preferredName role profileImage")
      .sort({ createdAt: -1 })
      .limit(Number(limit) + 1);

    const hasMore = messages.length > limit;

    if (hasMore) messages.pop();

    res.json({
      success: true,
      messages: messages.reverse(),
      hasMore,
    });
  } catch (err) {
    // console.error("Get messages error:", err);
    res.status(500).json({ message: "Failed to load messages" });
  }
};
