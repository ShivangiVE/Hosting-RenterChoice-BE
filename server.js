require("dotenv").config();
const http = require("http");
const app = require("./app");
const connectDB = require("./src/config/db");
const socket = require("./socket");
const { startJobs } = require("./src/jobs/reminder.job");
const {
  startInvoiceDraftCleanupJob,
} = require("./src/jobs/invoiceDraftCleanup.job");

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

connectDB().then(() => {
  socket.init(server);

  startJobs();
  startInvoiceDraftCleanupJob();

  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});

// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
