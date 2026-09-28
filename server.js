require("dotenv").config();
const http = require("http");
const app = require("./app");
const connectDB = require("./src/config/db");
const socket = require("./socket");
const { initFirebase } = require("./src/config/firebase");
const { startJobs } = require("./src/jobs/reminder.job");
const {
  startInvoiceDraftCleanupJob,
} = require("./src/jobs/invoiceDraftCleanup.job");

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

// connectDB().then(() => {
//   socket.init(server);

//   startJobs();
//   startInvoiceDraftCleanupJob();

//   server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
// });

connectDB().then(() => {
  socket.init(server);

  // Push notifications (Firebase). Logs a warning and carries on without
  // push if FIREBASE_SERVICE_ACCOUNT_BASE64 isn't set — never blocks startup.
  initFirebase();

  startJobs();
  startInvoiceDraftCleanupJob();

  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});

// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
