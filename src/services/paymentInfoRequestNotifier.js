
const User = require("../models/User");
const { createNotification } = require("./notificationService");
const { PAYMENT_INFO_REVIEWER_ROLES } = require("../constants/roles");

const REQUESTED = "PAYMENT_INFO_CHANGE_REQUESTED";

/** Alert every active Office Admin / Internal Team (and Admin) user */
async function notifyPaymentInfoReviewers(
  request,
  { companyName, requesterName },
) {
  const reviewers = await User.find({
    role: { $in: PAYMENT_INFO_REVIEWER_ROLES },
    isActive: true,
  })
    .select("_id role")
    .lean();

  const verb = request.changeType === "add" ? "add" : "update";
  // Last 4 digits only — full banking details stay out of notifications
  const message = `${requesterName} requested to ${verb} payment info for ${companyName} (account ending ${request.proposed.accountNumberLast4}). Please review.`;

  const results = await Promise.allSettled(
    reviewers.map((u) =>
      createNotification({
        user: u._id,
        role: u.role,
        type: REQUESTED,
        title: "Payment Info Approval Needed",
        message,
        entityType: "PaymentInfoChangeRequest",
        entityId: request._id,
        metadata: { companyId: request.company },
      }),
    ),
  );

  results.forEach((r) => {
    if (r.status === "rejected") {
      console.error("Payment info reviewer notification failed:", r.reason);
    }
  });
}

module.exports = { notifyPaymentInfoReviewers, REQUESTED };
