const jwt = require("jsonwebtoken");
const User = require("./src/models/User");

let io;

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

        socket.user = user; // attach user to socket
        next();
      } catch (err) {
        next(new Error("Invalid token"));
      }
    });

    io.on("connection", (socket) => {
      console.log("Socket connected:", socket.user._id.toString());

      socket.join(`user:${socket.user._id}`);

      // Vendor joins personal room
      if (socket.user.role === "Vendor") {
        socket.join(`vendor:${socket.user._id}`);
      }

      socket.on("disconnect", () => {
        console.log("Socket disconnected:", socket.user._id.toString());
      });
    });

    return io;
  },

  getIO: () => {
    if (!io) throw new Error("Socket.io not initialized");
    return io;
  },
};
