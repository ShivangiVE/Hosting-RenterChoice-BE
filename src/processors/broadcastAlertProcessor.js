
async function processBroadcastAlerts() {
  const now = new Date();

  for (const rule of getBroadcastRules()) {
    let dueDocs;
    try {
      dueDocs = await rule.findDue(now);
    } catch (err) {
      console.error(
        `[BroadcastAlertProcessor] rule "${rule.key}" findDue failed:`,
        err.message,
      );
      continue;
    }

    for (const doc of dueDocs) {
      try {
        await rule.fire(doc, now);
      } catch (err) {
        console.error(
          `[BroadcastAlertProcessor] rule "${rule.key}" failed for doc ${doc._id}:`,
          err.message,
        );
      }
    }
  }
}

const { getBroadcastRules } = require("../registries/broadcastAlertRegistry");
const { registerJob } = require("../jobs/registry");

registerJob({
  name: "processBroadcastAlerts",
  cronExpression: "0 7 * * *",
  task: processBroadcastAlerts,
});

module.exports = { processBroadcastAlerts };
