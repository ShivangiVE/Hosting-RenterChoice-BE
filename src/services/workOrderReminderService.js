const WorkOrder = require("../models/WorkOrder");
const WODynamicStatus = require("../models/WODynamicStatus");
const {
  resolveReminders,
  scheduleReminder,
} = require("./notificationReminderService");
const { notifyInternalUsers } = require("./internalNotificationService");
const { addBusinessDays } = require("../utils/businessDayMath");

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Accept / Decline cascade ──────────────────────────────────────────────

/**
 * Call once per invited vendor right after they're notified of a new
 * assignment (both "direct" and "company" pool paths) — from
 * notifyVendorAssigned.
 */
async function scheduleAcceptDeclineReminder(workOrder, vendorId) {
  await scheduleReminder({
    reminderType: "WORK_ORDER_ACCEPT_DECLINE_REMINDER",
    entityType: "WorkOrder",
    entityId: workOrder._id,
    userId: vendorId,
    role: "Vendor",
    cycleId: "WO_ACCEPT_DECLINE",
    title: "Reminder: Work Order Awaiting Your Response",
    message: `${workOrder.workOrderNumber} is still awaiting your Accept/Decline response.`,
    metadata: { workOrderNumber: workOrder.workOrderNumber },
  });
}

/**
 * Call from vendorAcceptWorkOrder / vendorDeclineWorkOrder (and wherever
 * the Repair Clerk records a vendor's decision on their behalf) once the
 * response is recorded, so the cascade for THAT vendor stops immediately
 * rather than waiting for the next sweep tick to no-op it via
 * isStillPending.
 */
async function resolveAcceptDeclineReminder(workOrderId, vendorId) {
  await resolveReminders(
    workOrderId,
    "WORK_ORDER_ACCEPT_DECLINE_REMINDER",
    vendorId,
  );
}

/**
 * Invoked by reminderEscalationRegistry once 2 business days have passed
 * with no response for this specific vendor+work order. Handles both the
 * "direct" single-vendor path and one vendor's slot in a "company" pool.
 */
async function expireAcceptDeclineReminder(schedule) {
  const woLean = await WorkOrder.findById(schedule.entityId).lean();
  if (!woLean) return;

  const declinedStatus = await WODynamicStatus.findOne({ name: "Declined" });

  if (woLean.assignmentType === "direct") {
    const updated = await WorkOrder.findOneAndUpdate(
      {
        _id: schedule.entityId,
        vendor: schedule.userId,
        vendorResponse: "pending",
      },
      {
        $set: {
          vendorResponse: "expired",
          ...(declinedStatus ? { dynamicStatus: declinedStatus._id } : {}),
          declinedDate: new Date(),
          status: "open",
        },
      },
      { new: true },
    );
    if (!updated) return; // vendor already responded — nothing to expire

    await notifyInternalUsers({
      eventType: "WORK_ORDER_ACCEPT_DECLINE_EXPIRED",
      title: "Work Order Auto-Cancelled — No Vendor Response",
      message: `${updated.workOrderNumber} was not accepted or declined within 2 business days and has been returned to you for reassignment.`,
      entityType: "WorkOrder",
      entityId: updated._id,
    }).catch(console.error);
    return;
  }

  if (woLean.assignmentType === "company") {
    const updated = await WorkOrder.findOneAndUpdate(
      {
        _id: schedule.entityId,
        "vendorResponses.user": schedule.userId,
        "vendorResponses.response": "pending",
      },
      {
        $set: {
          "vendorResponses.$.response": "expired",
          "vendorResponses.$.respondedAt": new Date(),
        },
      },
      { new: true },
    );
    if (!updated) return; // already responded

    await notifyInternalUsers({
      eventType: "WORK_ORDER_ACCEPT_DECLINE_EXPIRED",
      title: "Vendor Did Not Respond in Time",
      message: `One invited vendor on ${updated.workOrderNumber} did not respond within 2 business days.`,
      entityType: "WorkOrder",
      entityId: updated._id,
    }).catch(console.error);

    const stillOpen = updated.vendorResponses.some(
      (r) => r.response === "pending",
    );
    if (!stillOpen && !updated.vendor) {
      // Every invited vendor has now either declined or expired with no
      // acceptance — same terminal state the existing all-declined path
      // handles, so reuse that exact event (and whatever "reassign" UI
      // action is already wired to it) instead of inventing a parallel one.
      updated.vendorResponse = "declined";
      if (declinedStatus) updated.dynamicStatus = declinedStatus._id;
      updated.declinedDate = new Date();
      await updated.save();

      await notifyInternalUsers({
        eventType: "WORK_ORDER_ALL_VENDORS_DECLINED",
        title: "Work Order Declined by All Vendors",
        message: `No vendor at the assigned company responded to ${updated.workOrderNumber} in time. Please reassign.`,
        entityType: "WorkOrder",
        entityId: updated._id,
      }).catch(console.error);
    }
  }
}

// ── Post-acceptance tenant-contact cascade ────────────────────────────────

/**
 * Call from vendorAcceptWorkOrder right after acceptance succeeds. First
 * reminder fires at +2 days (client: reminders only START once 2 days have
 * passed without contact), then every 24h — see CYCLES.WO_TENANT_CONTACT.
 */
async function scheduleTenantContactReminder(workOrder) {
  await scheduleReminder({
    reminderType: "WORK_ORDER_TENANT_CONTACT_REMINDER",
    entityType: "WorkOrder",
    entityId: workOrder._id,
    userId: workOrder.vendor,
    role: "Vendor",
    cycleId: "WO_TENANT_CONTACT",
    title: "Reminder: Confirm Tenant Contact",
    message: `Please confirm you've contacted the tenant to arrange entry for ${workOrder.workOrderNumber}.`,
    metadata: { workOrderNumber: workOrder.workOrderNumber },
    startAt: new Date(Date.now() + 2 * DAY_MS),
  });
}

/**
 * Call from wherever the vendor checks the "I called the tenant" /
 * in-contact box lands (per the client doc this already exists as part of
 * the Communications feature — this is the integration point for it).
 *
 * @param {ObjectId} workOrderId
 * @param {ObjectId} vendorId
 */
async function resolveTenantContactReminder(workOrderId, vendorId) {
  await resolveReminders(
    workOrderId,
    "WORK_ORDER_TENANT_CONTACT_REMINDER",
    vendorId,
  );
}

/**
 * Invoked by reminderEscalationRegistry once 1 full week has passed since
 * acceptance with tenant contact still unconfirmed.
 *
 * ASSUMPTION FLAGGED: this checks `workOrder.tenantContactConfirmedAt`.
 * Confirm that's the actual field your "check off a button" feature sets —
 * rename here (one place) if it's called something else.
 */
async function expireTenantContactReminder(schedule) {
  const inProgressStatus = await WODynamicStatus.findOne({
    name: "In Progress",
  });
  const declinedStatus = await WODynamicStatus.findOne({ name: "Declined" });

  const filter = {
    _id: schedule.entityId,
    vendor: schedule.userId,
    tenantContactConfirmedAt: null,
  };
  if (inProgressStatus) filter.dynamicStatus = inProgressStatus._id;

  const updated = await WorkOrder.findOneAndUpdate(
    filter,
    {
      $set: {
        vendorResponse: "expired",
        ...(declinedStatus ? { dynamicStatus: declinedStatus._id } : {}),
        declinedDate: new Date(),
        status: "open",
      },
    },
    { new: true },
  );
  if (!updated) return; // already contacted, or moved past "In Progress"

  await notifyInternalUsers({
    eventType: "WORK_ORDER_TENANT_CONTACT_EXPIRED",
    title: "Work Order Auto-Cancelled — Tenant Never Contacted",
    message: `${updated.workOrderNumber} was accepted but the vendor never confirmed tenant contact within 1 week. It has been returned to you for reassignment.`,
    entityType: "WorkOrder",
    entityId: updated._id,
  }).catch(console.error);
}

// ── Completed → invoice pending (vendor-facing weekly leg) ───────────────

/**
 * Call from markWorkOrderCompleted, in place of the old immediate
 * VENDOR_DEFAULT scheduling, when the vendor chose "upload later". Starts
 * 3 BUSINESS days after Completed, then weekly (WO_INVOICE_VENDOR_WEEKLY).
 * Resolved by the existing resolveReminders(workOrder._id,
 * "INVOICE_UPLOAD_PENDING") call in vendorUploadInvoiceLater — unchanged.
 */
async function scheduleInvoiceVendorReminder(workOrder) {
  await scheduleReminder({
    reminderType: "INVOICE_UPLOAD_PENDING",
    entityType: "WorkOrder",
    entityId: workOrder._id,
    userId: workOrder.vendor,
    role: "Vendor",
    cycleId: "WO_INVOICE_VENDOR_WEEKLY",
    title: "Invoice Upload Pending",
    message: `Please upload the invoice for work order ${workOrder.workOrderNumber}.`,
    metadata: { workOrderNumber: workOrder.workOrderNumber },
    startAt: addBusinessDays(new Date(), 3),
  });
}

// ── Vendor status-change side effects (Repair Clerk alerts) ──────────────

/**
 * @param {WorkOrder} workOrder
 * @param {string}    previousStatusName
 */
async function applyDynamicStatusChangeSideEffects(
  workOrder,
  previousStatusName,
) {
  const newStatusDoc = await WODynamicStatus.findById(workOrder.dynamicStatus);
  const newStatusName = newStatusDoc?.name;
  if (!newStatusName || newStatusName === previousStatusName) return;

  // ── Return Visit Required tracking (init / clear) ────────────────────
  if (newStatusName === "Return Visit Required") {
    workOrder.returnVisitStatusSetAt = new Date();
    workOrder.returnVisitAlertCount = 0;
    workOrder.lastReturnVisitAlertFiredAt = null;
    workOrder.returnVisitAlertsSilencedUntil = null;
    await workOrder.save();
  } else if (previousStatusName === "Return Visit Required") {
    workOrder.returnVisitStatusSetAt = null;
    workOrder.returnVisitAlertCount = 0;
    workOrder.lastReturnVisitAlertFiredAt = null;
    workOrder.returnVisitAlertsSilencedUntil = null;
    await workOrder.save();
  }

  // ── Repair Clerk alert ─────────────────────────────────────────────────
  const isFollowUp = newStatusName === "Follow-up Required";
  await notifyInternalUsers({
    eventType: isFollowUp
      ? "WORK_ORDER_FOLLOW_UP_REQUIRED"
      : "WORK_ORDER_STATUS_CHANGED",
    title: isFollowUp
      ? "Follow-up Required — Call the Vendor"
      : "Vendor Updated Work Order Status",
    message: isFollowUp
      ? `${workOrder.workOrderNumber} needs a follow-up call with the vendor before work can continue.`
      : `${workOrder.workOrderNumber} status changed to "${newStatusName}" by the vendor.`,
    entityType: "WorkOrder",
    entityId: workOrder._id,
    metadata: {
      workOrderNumber: workOrder.workOrderNumber,
      previousStatus: previousStatusName,
      newStatus: newStatusName,
    },
  }).catch(console.error);
}

// ── Attachment upload alert (one-shot, event-driven — not a reminder) ────
async function notifyAttachmentUploaded(workOrder, { fileName } = {}) {
  await notifyInternalUsers({
    eventType: "WORK_ORDER_ATTACHMENT_UPLOADED",
    title: "New Vendor Attachment",
    message: fileName
      ? `Vendor uploaded "${fileName}" to ${workOrder.workOrderNumber}.`
      : `Vendor uploaded a new file to ${workOrder.workOrderNumber}.`,
    entityType: "WorkOrder",
    entityId: workOrder._id,
    metadata: { workOrderNumber: workOrder.workOrderNumber },
  }).catch(console.error);
}

module.exports = {
  scheduleAcceptDeclineReminder,
  resolveAcceptDeclineReminder,
  expireAcceptDeclineReminder,
  scheduleTenantContactReminder,
  resolveTenantContactReminder,
  expireTenantContactReminder,
  scheduleInvoiceVendorReminder,
  applyDynamicStatusChangeSideEffects,
  notifyAttachmentUploaded,
};
