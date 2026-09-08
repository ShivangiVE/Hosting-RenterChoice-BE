const ServiceAgreement = require("../models/ServiceAgreement");
const { computeNextCycleDates } = require("../utils/dateMath");

const {
  buildCycleAgreementNumber,
  cycleNumberToLetters,
} = require("../utils/serviceAgreementNumbering");
const { notifyInternalUsers } = require("./internalNotificationService");


/**
 * Creates the next cycle document for a recurring Service Agreement.
 *
 * Called by the daily sweep (serviceAgreementCycleProcessor.processNextCycleCreation)
 * once `previousSA.nextCycleStartDate` falls within the 30-day lead window,
 * and idempotency-guarded by `previousSA.nextCycleCreated` so a cycle is
 * never created twice even if the sweep somehow ran the same SA through
 * this function again on a later tick.
 *
 * Deliberately does NOT touch the shared `Counter` — the base number was
 * already issued once, at the very first cycle's creation. Deliberately
 * does NOT copy vendor/company assignment forward — per the client, the
 * team manually decides same-vendor-direct vs. out-for-quote after the
 * alert fires, so the new cycle starts fully unassigned.
 */
async function createNextCycle(previousSA) {
  if (!previousSA.recurringSchedule) {
    throw new Error(
      "createNextCycle called on a non-recurring service agreement",
    );
  }
  if (previousSA.nextCycleCreated) {
    return ServiceAgreement.findById(previousSA.nextCycleId);
  }

  const { startDate, endDate } = computeNextCycleDates(
    previousSA.startDate,
    previousSA.endDate,
    previousSA.recurringSchedule,
  );

  const nextCycleNumber = (previousSA.cycleNumber || 1) + 1;
  const nextCycleLetter = cycleNumberToLetters(nextCycleNumber);
  const serviceAgreementNumber = buildCycleAgreementNumber(
    previousSA.baseAgreementNumber,
    nextCycleLetter,
  );

  const now = new Date();

  const nextCycle = await ServiceAgreement.create({
    serviceAgreementNumber,
    baseAgreementNumber: previousSA.baseAgreementNumber,
    recurringGroupId: previousSA.recurringGroupId,
    cycleNumber: nextCycleNumber,
    cycleLetter: nextCycleLetter,
    previousCycle: previousSA._id,

    category: previousSA.category,
    building: previousSA.building,
    description: previousSA.description,
    startDate,
    endDate,
    recurringSchedule: previousSA.recurringSchedule,

    // Unassigned until a team member routes it — see note above.
    assignmentType: "unassigned",
    vendor: null,
    vendorResponses: [],
    vendorResponse: "pending",

    awaitingCycleRouting: true,
    cycleAlertCount: 1, // the notifyInternalUsers call below IS alert #1
    lastCycleAlertFiredAt: now,

    createdBy: previousSA.createdBy,
  });

  // Precompute and stash when THIS new cycle's own successor should start,
  // so the sweep never has to re-derive it later.
  const following = computeNextCycleDates(
    startDate,
    endDate,
    previousSA.recurringSchedule,
  );
  nextCycle.nextCycleStartDate = following.startDate;
  await nextCycle.save();

  previousSA.nextCycleCreated = true;
  previousSA.nextCycleId = nextCycle._id;
  await previousSA.save();

  // Initial alert — 1 month before the new cycle's start date, per the
  // client. Team-wide, since no vendor is assigned yet to notify instead.
  await notifyInternalUsers({
    eventType: "SERVICE_AGREEMENT_NEW_CYCLE_CREATED",
    title: "New Service Agreement Cycle Needs Assignment",
    message: `${serviceAgreementNumber} was auto-created for the next ${previousSA.recurringSchedule} cycle (starts ${startDate.toLocaleDateString()}). Please assign a vendor or send it out for quotes.`,
    entityType: "ServiceAgreement",
    entityId: nextCycle._id,
  }).catch(console.error);

  return nextCycle;
}

module.exports = { createNextCycle };
