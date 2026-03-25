require("dotenv").config();
const http = require("http");
const app = require("./app");
const connectDB = require("./src/config/db");
const socket = require("./socket");

const PORT = process.env.PORT || 3000;

// Connect DB first
connectDB();

const server = http.createServer(app);

// INIT SOCKET
socket.init(server);
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
