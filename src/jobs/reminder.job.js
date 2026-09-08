const cron = require("node-cron");

require("../processors/reminderProcessor");
require("../processors/serviceAgreementCycleProcessor");
require("../processors/broadcastAlertProcessor");
require("../processors/notificationDigestProcessor");
require("../registries/rules");

const { getJobs } = require("./registry");

function startJobs() {
  for (const job of getJobs()) {
    cron.schedule(job.cronExpression, async () => {
      try {
        await job.task();
      } catch (err) {
        console.error(`[Jobs] ${job.name} error:`, err.message);
      }
    });
    console.log(`[Jobs] ${job.name} started (${job.cronExpression})`);
  }
}

module.exports = { startJobs };
