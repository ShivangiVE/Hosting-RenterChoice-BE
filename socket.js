const jwt = require("jsonwebtoken");
const User = require("./src/models/User");
const Message = require("./src/models/Communication/Message");
const Conversation = require("./src/models/Communication/Conversation");
const WorkOrder = require("./src/models/WorkOrder");
const { canSendMessage } = require("./src/domain/chatPolicy");

let io;

const onlineUsers = new Map();

module.exports = {
  init: (server) => {
    io = require("socket.io")(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    // JWT AUTH FOR SOCKET
    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error("Authentication error"));

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("_id role preferredName profileImage");

        if (!user) return next(new Error("User not found"));

        socket.user = user;
        next();
      } catch (err) {
        next(new Error("Invalid token"));
      }
    });


    io.on("connection", (socket) => {
      const userId = socket.user._id.toString();

      console.log("Socket connected:", userId);

      onlineUsers.set(userId, socket.id);
      socket.join(`user:${userId}`);

      // ========================================
      // JOIN ALL GROUP CONVERSATIONS ON CONNECT
      // ========================================
      (async () => {
        try {
          const userConversations = await Conversation.find({
            participants: socket.user._id,
          }).select("_id type");

          userConversations.forEach((conv) => {
            socket.join(`conversation:${conv._id}`);
          });

          console.log(
            `User ${userId} joined ${userConversations.length} conversations`,
          );
        } catch (err) {
          console.error("Error joining conversations:", err);
        }
      })();

      // JOIN WORK ORDER ROOM (Timeline updates)
      socket.on("join_workorder", (workOrderId) => {
        if (!workOrderId) return;
        socket.join(`workorder:${workOrderId}`);
      });

      // JOIN CONVERSATION ROOM
      socket.on("join_conversation", (conversationId) => {
        socket.join(`conversation:${conversationId}`);
      });

      // SEND MESSAGE 
      socket.on("send_message", async ({ conversationId, text }) => {
        try {
          const sender = socket.user;

          if (!text || !text.trim()) {
            return socket.emit("chat_error", {
              message: "Message cannot be empty",
            });
          }

          const convo = await Conversation.findById(conversationId);

          if (!convo) {
            return socket.emit("chat_error", {
              message: "Conversation not found",
            });
          }

          // Ensure sender is participant
          if (!convo.participants.includes(sender._id)) {
            return socket.emit("chat_error", {
              message: "Unauthorized",
            });
          }

          // Fetch participant roles
          const participants = await User.find({
            _id: { $in: convo.participants },
          }).select("role preferredName");

          const receiverRoles = participants
            .filter((p) => p._id.toString() !== sender._id.toString())
            .map((p) => p.role);

          // Fetch work order status (if linked)
          let workOrderStatus = null;
          if (convo.workOrder) {
            const wo = await WorkOrder.findById(convo.workOrder).select(
              "status",
            );
            workOrderStatus = wo?.status || null;
          }

          // DOMAIN RULE CHECK
          const allowed = canSendMessage({
            senderRole: sender.role,
            receiverRoles,
            workOrderStatus,
          });

          if (!allowed) {
            return socket.emit("chat_error", {
              code: "CHAT_BLOCKED",
              message:
                "Chat with tenant is closed after work order closure. You can still contact Repairs Team.",
            });
          }

          // Save message
          const msg = await Message.create({
            conversation: conversationId,
            sender: sender._id,
            content: text.trim(),
          });

          convo.lastMessage = msg._id;
          await convo.save();

          // Populate sender for real-time display
          await msg.populate("sender", "preferredName role profileImage");

          // Emit to ALL participants in the conversation room
          io.to(`conversation:${conversationId}`).emit("new_message", msg);

        } catch (err) {
          console.error("Socket send_message error:", err);
          socket.emit("chat_error", {
            message: "Failed to send message",
          });
        }
      });

      // TYPING INDICATOR
      socket.on("typing", (conversationId) => {
        socket.to(`conversation:${conversationId}`).emit("typing", {
          userId: socket.user._id,
          role: socket.user.role,
        });
      });

      socket.on("disconnect", () => {
        const userId = socket.user._id.toString();
        onlineUsers.delete(userId);
        console.log("Socket disconnected:", userId);
      });
    });

    return io;
  },

  getIO: () => {
    if (!io) throw new Error("Socket.io not initialized");
    return io;
  },

  getOnlineUsers: () => onlineUsers,
};
