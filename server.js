require("dotenv").config();
const http = require("http");
const app = require("./app");
const connectDB = require("./src/config/db");
const socket = require("./socket");
const { startJobs } = require("./src/jobs/reminder.job");

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

connectDB().then(() => {
  socket.init(server);

  startJobs();

  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});

// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
