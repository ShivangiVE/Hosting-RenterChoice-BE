/**
 * One-off backfill for ServiceAgreement documents created before the
 * recurring-cycle fields existed. Run once, right after deploying the new
 * schema and BEFORE the daily cron job is enabled:
 *
 *   node scripts/backfillServiceAgreementCycleFields.js
 *
 * Safe to re-run — it only touches documents missing baseAgreementNumber.
 *
 * Every pre-existing SA (recurring or not) is treated as the sole member
 * of its own group: baseAgreementNumber = its current serviceAgreementNumber
 * (left exactly as-is, unchanged — never retroactively renamed to add a
 * suffix, since that number may already be referenced on invoices,
 * documents, etc.), recurringGroupId = its own _id, cycleNumber = 1 (or
 * null if it isn't recurring), cycleLetter = null.
 *
 * Leaving cycleLetter null on a grandfathered recurring SA is intentional:
 * its bare legacy number plays the role "a" would have played for a new
 * agreement. Its cycleNumber is still 1, so the very next auto-created
 * cycle correctly becomes cycleNumber 2 -> letter "b" — the numbering
 * picks up cleanly from there without colliding with the un-suffixed
 * legacy number.
 *
 * RESILIENCE: one document failing validation (e.g. pre-existing bad data
 * with a missing startDate/endDate, or a corrupted recurringSchedule value
 * from before this feature existed) does NOT abort the whole run — it's
 * caught, logged, and skipped so every other document still gets migrated.
 * Failed documents are summarized at the end for manual follow-up.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const ServiceAgreement = require("../src/models/ServiceAgreement");
const { computeNextCycleDates } = require("../src/utils/dateMath");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const missing = await ServiceAgreement.find({
    baseAgreementNumber: { $exists: false },
  });

  console.log(`Backfilling ${missing.length} service agreement(s)...`);

  let succeeded = 0;
  const failed = [];

  for (const sa of missing) {
    try {
      sa.baseAgreementNumber = sa.serviceAgreementNumber;
      sa.recurringGroupId = sa._id;
      sa.cycleNumber = sa.recurringSchedule ? 1 : null;
      sa.cycleLetter = null;

      if (sa.recurringSchedule) {
        try {
          sa.nextCycleStartDate = computeNextCycleDates(
            sa.startDate,
            sa.endDate,
            sa.recurringSchedule,
          ).startDate;
        } catch (err) {
          console.warn(
            `  Skipping nextCycleStartDate for ${sa.serviceAgreementNumber}: ${err.message}`,
          );
        }
      }

      await sa.save();
      succeeded += 1;
      console.log(`  OK: ${sa.serviceAgreementNumber}`);
    } catch (err) {
      failed.push({
        id: sa._id.toString(),
        number: sa.serviceAgreementNumber,
        error: err.message,
      });
      console.error(
        `  FAILED: ${sa.serviceAgreementNumber} (${sa._id}) — ${err.message}`,
      );
    }
  }

  console.log(`\nDone. ${succeeded} succeeded, ${failed.length} failed.`);
  if (failed.length > 0) {
    console.log(
      "\nThese documents have PRE-EXISTING data issues unrelated to this " +
        "migration (missing startDate/endDate, or an invalid " +
        "recurringSchedule value that predates this feature) and need " +
        "manual attention directly in the database — fix or delete them, " +
        "then re-run this script:",
    );
    failed.forEach((f) => console.log(`  - ${f.number} (${f.id}): ${f.error}`));
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
