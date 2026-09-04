const cron = require("node-cron");
const { processReminders } = require("../processors/reminderProcessor");
const { processServiceAgreementCycles } = require("../processors/serviceAgreementCycleProcessor");

function startJobs() {
  // Every minute — processor is self-batching (BATCH_SIZE = 100)
  cron.schedule("* * * * *", async () => {
    try {
      await processReminders();
    } catch (err) {
      console.error("[Jobs] processReminders error:", err.message);
    }
  });

  // Once daily — Service Agreement recurring-cycle lifecycle: auto-creates
  // the next cycle ~30 days before its start date, escalates the "needs
  // assignment" alert cascade, and drives the final-invoice end-of-period
  // notifications. Daily granularity is enough — every rule in this
  // feature operates in days, not minutes. Adjust the hour below to taste
  // (currently 6am server time); wrap in a timezone-aware schedule if your
  // deployment needs a specific local time regardless of server TZ.
  cron.schedule("0 6 * * *", async () => {
    try {
      await processServiceAgreementCycles();
    } catch (err) {
      console.error("[Jobs] processServiceAgreementCycles error:", err.message);
    }
  });

  console.log("[Jobs] Reminder engine started");
  console.log("[Jobs] Service agreement cycle engine started");
}

module.exports = { startJobs };
