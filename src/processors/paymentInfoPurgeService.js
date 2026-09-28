const { registerJob } = require("../jobs/registry");
const Company = require("../models/ContactCards/Company");
const AuditService = require("../services/auditService");

const PURGE_AFTER_HOURS = 72;

// Erased on purge. bankId/bankName are kept: not sensitive alone, and useful
// context when reading historical payments. Confirm with the client.
const SENSITIVE_PAYMENT_FIELDS = [
  "paymentInfo.epay.accountNumberEncrypted",
  "paymentInfo.epay.accountNumberLast4",
  "paymentInfo.epay.transit",
  "paymentInfo.epay.institutionNumber",
];

/**
 * Erases banking details for companies deactivated continuously for 72+ hours.
 * Reactivation clears deactivatedAt, so the company drops out of this query
 * and its details survive.
 */
async function purgeExpiredPaymentInfo() {
  const cutoff = new Date(Date.now() - PURGE_AFTER_HOURS * 60 * 60 * 1000);

  const due = await Company.find({
    isActive: false,
    deactivatedAt: { $ne: null, $lte: cutoff },
    paymentInfoPurgedAt: null,
    // Only companies that actually hold banking details
    "paymentInfo.epay.bankId": { $exists: true },
  })
    .select("_id companyName companyAccountNumber deactivatedAt")
    .lean();

  if (!due.length) return { purged: 0 };

  const $unset = SENSITIVE_PAYMENT_FIELDS.reduce((acc, field) => {
    acc[field] = "";
    return acc;
  }, {});

  await Company.updateMany(
    { _id: { $in: due.map((c) => c._id) } },
    { $unset, $set: { paymentInfoPurgedAt: new Date() } },
  );

  for (const c of due) {
    await AuditService.logActivity({
      module: "Company",
      action: "PURGE_PAYMENT_INFO",
      entityId: c._id,
      userId: null, // system job
      description:
        `Banking details erased for company ${c.companyName} ` +
        `(#${c.companyAccountNumber}) — deactivated since ` +
        `${c.deactivatedAt.toISOString()}, ${PURGE_AFTER_HOURS}h retention elapsed`,
    }).catch((err) => console.error("[payment-purge] audit failed:", err));
  }

  return { purged: due.length, companies: due };
}

module.exports = { purgeExpiredPaymentInfo, PURGE_AFTER_HOURS };

registerJob({
  name: "purgeExpiredPaymentInfo",
  cronExpression: "0 * * * *", // hourly — the policy is "within 72 hours"
  task: purgeExpiredPaymentInfo,
});
