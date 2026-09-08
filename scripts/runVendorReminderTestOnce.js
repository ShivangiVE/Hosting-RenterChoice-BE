require("dotenv").config();
const mongoose = require("mongoose");
const { processReminders } = require("../src/processors/reminderProcessor");
const {
  processBroadcastAlerts,
} = require("../src/processors/broadcastAlertProcessor");
require("../src/registries/rules");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  console.log("── Running processReminders() ──");
  await processReminders();

  console.log("── Running processBroadcastAlerts() ──");
  await processBroadcastAlerts();

  console.log("Done.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
