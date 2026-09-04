/**
 * Manually run the Service Agreement recurring-cycle sweep ONE TIME, on
 * demand — for local/QA testing, instead of waiting for the daily cron
 * tick (or real calendar days) to pass.
 *
 * Usage:
 *   node scripts/runServiceAgreementCycleSweepOnce.js
 *
 * Run this against a dev/staging database, not production — it will
 * actually create documents and send notifications, same as the real cron.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { processServiceAgreementCycles } = require("../src/processors/serviceAgreementCycleProcessor");


async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Running Service Agreement cycle sweep...");
  await processServiceAgreementCycles();
  console.log("Done.");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
