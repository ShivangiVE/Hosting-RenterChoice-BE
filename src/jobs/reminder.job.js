const cron = require("node-cron");
const { processReminders } = require("../processors/reminderProcessor");

function startJobs() {
  // Every minute — processor is self-batching (BATCH_SIZE = 100)
  cron.schedule("* * * * *", async () => {
    try {
      await processReminders();
    } catch (err) {
      console.error("[Jobs] processReminders error:", err.message);
    }
  });

  console.log("[Jobs] Reminder engine started");
}

module.exports = { startJobs };
