const ServiceAgreement = require("../models/ServiceAgreement");
const { createNextCycle } = require("../services/serviceAgreementCycleService");
const {
  notifyInternalUsers,
} = require("../services/internalNotificationService");
const { getNextDelay } = require("../registries/reminderCycleRegistry");
const { addDays, getCycleCreationLeadDays } = require("../utils/dateMath");
const { registerJob } = require("../jobs/registry");

const MS_PER_MINUTE = 60 * 1000;

async function processServiceAgreementCycles() {
  const now = new Date();
  await processNextCycleCreation(now);
  await processNewCycleAlertCascade(now);
  await processFinalInvoiceNotifications(now);
}

// ── Step 1: auto-create the next cycle, lead time capped per schedule ─────
async function processNextCycleCreation(now) {
  // Broad prefilter using the maximum possible lead time (30 days) — cheap,
  // uses the nextCycleStartDate index. The precise per-schedule lead cap
  // (see getCycleCreationLeadDays) is applied below in application code,
  // since it varies by recurringSchedule and isn't expressible as a single
  const candidates = await ServiceAgreement.find({
    status: "open",
    recurringSchedule: { $ne: null },
    nextCycleCreated: { $ne: true },
    nextCycleStartDate: { $ne: null, $lte: addDays(now, 30) },
  });

  for (const sa of candidates) {
    try {
      const leadDays = getCycleCreationLeadDays(sa.recurringSchedule);
      const dueBy = addDays(now, leadDays);

      if (sa.nextCycleStartDate > dueBy) continue;

      await createNextCycle(sa);
    } catch (err) {
      console.error(
        `[SA Cycle] Failed to create next cycle for ${sa.serviceAgreementNumber}:`,
        err.message,
      );
    }
  }
}

// ── Step 2: escalate the "still needs assignment" alert on schedule ───────
async function processNewCycleAlertCascade(now) {
  const pending = await ServiceAgreement.find({
    awaitingCycleRouting: true,
    status: "open",
  });

  for (const sa of pending) {
    try {
      const dueAt = sa.lastCycleAlertFiredAt
        ? new Date(
            sa.lastCycleAlertFiredAt.getTime() +
              getNextDelay(sa.cycleAlertCount, "SA_NEW_CYCLE_ALERT") *
                MS_PER_MINUTE,
          )
        : now; // defensive fallback if lastCycleAlertFiredAt was ever missed

      if (dueAt > now) continue;

      await notifyInternalUsers({
        eventType: "SERVICE_AGREEMENT_NEW_CYCLE_CREATED",
        title: "Service Agreement Cycle Still Needs Assignment",
        message: `${sa.serviceAgreementNumber} still needs a vendor assignment or quote request before it starts on ${sa.startDate.toLocaleDateString()}.`,
        entityType: "ServiceAgreement",
        entityId: sa._id,
      }).catch(console.error);

      sa.cycleAlertCount += 1;
      sa.lastCycleAlertFiredAt = now;
      await sa.save();
    } catch (err) {
      console.error(
        `[SA Cycle] Failed to process assignment alert for ${sa.serviceAgreementNumber}:`,
        err.message,
      );
    }
  }
}

// ── Step 3: final-invoice notification once a cycle's endDate has passed ──
async function processFinalInvoiceNotifications(now) {
  const ended = await ServiceAgreement.find({
    status: "open",
    endDate: { $lte: now },
    finalInvoiceNoticeSent: { $ne: true },
  });

  for (const sa of ended) {
    try {
      if (sa.invoiceUploaded) {
        // At least one invoice was submitted this cycle — a single notice,
        // not a repeating reminder.
        await notifyInternalUsers({
          eventType: "SERVICE_AGREEMENT_FINAL_INVOICE_CHECK",
          title: "Service Agreement Period Ended — Confirm Final Invoice",
          message: `${sa.serviceAgreementNumber}'s period ended on ${sa.endDate.toLocaleDateString()}. At least one invoice was submitted — please confirm whether a final invoice is still required.`,
          entityType: "ServiceAgreement",
          entityId: sa._id,
        }).catch(console.error);

        sa.finalInvoiceNoticeSent = true;
        await sa.save();
        continue;
      }

      // Zero invoices submitted for this cycle — insistent, repeating reminder.
      const dueAt = sa.lastFinalInvoiceReminderFiredAt
        ? new Date(
            sa.lastFinalInvoiceReminderFiredAt.getTime() +
              getNextDelay(
                sa.finalInvoiceReminderCount,
                "SA_FINAL_INVOICE_PENDING",
              ) *
                MS_PER_MINUTE,
          )
        : now;

      if (dueAt > now) continue;

      await notifyInternalUsers({
        eventType: "SERVICE_AGREEMENT_FINAL_INVOICE_CHECK",
        title: "Service Agreement Period Ended — No Invoice Submitted",
        message: `${sa.serviceAgreementNumber}'s period ended on ${sa.endDate.toLocaleDateString()} and no invoice has been submitted yet.`,
        entityType: "ServiceAgreement",
        entityId: sa._id,
      }).catch(console.error);

      sa.finalInvoiceReminderCount += 1;
      sa.lastFinalInvoiceReminderFiredAt = now;
      await sa.save();
    } catch (err) {
      console.error(
        `[SA Cycle] Failed to process final-invoice notification for ${sa.serviceAgreementNumber}:`,
        err.message,
      );
    }
  }
}

module.exports = { processServiceAgreementCycles };

registerJob({
  name: "processServiceAgreementCycles",
  cronExpression: "0 6 * * *",
  task: processServiceAgreementCycles,
});
