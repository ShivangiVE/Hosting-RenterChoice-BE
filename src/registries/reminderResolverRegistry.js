/**
 * Each key maps to an async function(entityId) → boolean.
 * Return true  = still pending, fire the reminder.
 * Return false = resolved, auto-stop the reminder.
 *
 * Lazy-require the models to avoid circular deps at startup.
 */
const resolvers = {
  async INVOICE_UPLOAD_PENDING(entityId) {
    const WorkOrder = require("../../models/WorkOrder");
    const wo = await WorkOrder.findById(entityId)
      .select("invoicePending invoiceUploaded")
      .lean();
    if (!wo) return false;
    return wo.invoicePending === true && wo.invoiceUploaded !== true;
  },

  async KEY_RETURN_PENDING(entityId) {
    const WorkOrder = require("../../models/WorkOrder");
    const wo = await WorkOrder.findById(entityId).select("keyReturn").lean();
    if (!wo) return false;
    return wo.keyReturn?.status === "pending";
  },

  async INSPECTION_REPORT_PENDING(entityId) {
    const InspectionRequest = require("../../models/InspectionRequest");
    const insp = await InspectionRequest.findById(entityId)
      .select("reportUploaded status")
      .lean();
    if (!insp) return false;
    return insp.reportUploaded !== true && insp.status !== "closed";
  },

  async LEASE_EXPIRY_NOTICE(entityId) {
    const Lease = require("../../models/Lease");
    const lease = await Lease.findById(entityId)
      .select("status expiryAcknowledged")
      .lean();
    if (!lease) return false;
    return lease.status === "active" && lease.expiryAcknowledged !== true;
  },

  async TASK_OVERDUE(entityId) {
    const Task = require("../../models/Task");
    const task = await Task.findById(entityId).select("status").lean();
    if (!task) return false;
    return !["completed", "cancelled"].includes(task.status);
  },

  async WORK_ORDER_ACCEPT_DECLINE_REMINDER(entityId) {
    const WorkOrder = require("../../models/WorkOrder");
    const wo = await WorkOrder.findById(entityId)
      .select("assignmentType vendorResponse")
      .lean();
    if (!wo) return false;
    if (wo.assignmentType === "direct") {
      return wo.vendorResponse === "pending";
    }
    // Company pool: the reminder is scheduled per invited vendor (see
    // notificationReminderService's userId-scoped idempotency). If THIS
    // vendor already responded, vendorAcceptWorkOrder/vendorDeclineWorkOrder
    // already called resolveAcceptDeclineReminder directly for them — so
    // any schedule still "active" by the time this resolver runs is
    // genuinely still pending. There's no per-vendor field to check here
    // because isStillPending only receives (reminderType, entityId), not
    // which vendor's schedule is being evaluated.
    return true;
  },

  async WORK_ORDER_TENANT_CONTACT_REMINDER(entityId) {
    const WorkOrder = require("../../models/WorkOrder");
    const wo = await WorkOrder.findById(entityId)
      .select("tenantContactConfirmedAt")
      .lean();
    if (!wo) return false;
    return !wo.tenantContactConfirmedAt;
  },
};

/**
 * @param {string}   reminderType
 * @param {ObjectId} entityId
 * @returns {Promise<boolean>}
 */
async function isStillPending(reminderType, entityId) {
  const resolver = resolvers[reminderType];
  if (!resolver) {
    console.warn(`[ResolverRegistry] No resolver for type: ${reminderType}`);
    return false; // Unknown type → don't keep firing
  }
  return resolver(entityId);
}

module.exports = { isStillPending };
