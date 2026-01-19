const jwt = require("jsonwebtoken");
const User = require("./src/models/User");
const Message = require("./src/models/Communication/Message");
const Conversation = require("./src/models/Communication/Conversation");

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
        const user = await User.findById(decoded.id).select("_id role");

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

      //  MARK USER ONLINE
      onlineUsers.set(userId, socket.id);

      socket.join(`user:${userId}`);

      if (socket.user.role === "Vendor") {
        socket.join(`vendor:${userId}`);
      }

      // CHAT EVENTS START HERE
      // 1️ JOIN CONVERSATION ROOM
      socket.on("join_conversation", (conversationId) => {
        socket.join(`conversation:${conversationId}`);
      });

      // 2️ SEND MESSAGE
      socket.on("send_message", async ({ conversationId, text }) => {
        try {
          const msg = await Message.create({
            conversation: conversationId,
            sender: socket.user._id,
            content: text,
          });

          await Conversation.findByIdAndUpdate(conversationId, {
            lastMessage: msg._id,
          });

          io.to(`conversation:${conversationId}`).emit("new_message", msg);
        } catch (err) {
          console.error("Send message error:", err);
          socket.emit("chat_error", {
            message: "Failed to send message",
          });
        }
      });

      // 3 TYPING INDICATOR
      socket.on("typing", (conversationId) => {
        socket.to(`conversation:${conversationId}`).emit("typing", {
          userId: socket.user._id,
          role: socket.user.role,
        });
      });

      // CHAT EVENTS END HERE
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
