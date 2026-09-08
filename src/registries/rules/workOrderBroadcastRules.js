const WorkOrder = require("../../models/WorkOrder");
const WODynamicStatus = require("../../models/WODynamicStatus");
const {
  notifyInternalUsers,
} = require("../../services/internalNotificationService");
const { addDays } = require("../../utils/dateMath");
const { registerBroadcastRule } = require("../broadcastAlertRegistry");

const RETURN_VISIT_INITIAL_DELAY_DAYS = 7;
const RETURN_VISIT_REPEAT_DAYS = 2;
const ACCOUNTS_ESCALATION_DAYS = 21;

registerBroadcastRule({
  key: "workOrder.returnVisitRequired",
  findDue: async (now) => {
    const returnVisitStatus = await WODynamicStatus.findOne({
      name: "Return Visit Required",
    });
    if (!returnVisitStatus) {
      console.warn(
        '[WorkOrderBroadcastRules] No "Return Visit Required" WODynamicStatus found — skipping.',
      );
      return [];
    }

    const candidates = await WorkOrder.find({
      dynamicStatus: returnVisitStatus._id,
      status: { $ne: "closed" },
      returnVisitStatusSetAt: { $ne: null },
    });

    return candidates.filter((wo) => {
      if (
        wo.returnVisitAlertsSilencedUntil &&
        wo.returnVisitAlertsSilencedUntil > now
      ) {
        return false;
      }
      const dueAt = wo.lastReturnVisitAlertFiredAt
        ? addDays(wo.lastReturnVisitAlertFiredAt, RETURN_VISIT_REPEAT_DAYS)
        : addDays(wo.returnVisitStatusSetAt, RETURN_VISIT_INITIAL_DELAY_DAYS);
      return dueAt <= now;
    });
  },
  fire: async (wo, now) => {
    await notifyInternalUsers({
      eventType: "WORK_ORDER_RETURN_VISIT_ALERT",
      title: "Return Visit Still Required",
      message: `${wo.workOrderNumber} has been in "Return Visit Required" status since ${wo.returnVisitStatusSetAt.toLocaleDateString()} with no update.`,
      entityType: "WorkOrder",
      entityId: wo._id,
      metadata: { workOrderNumber: wo.workOrderNumber },
    }).catch(console.error);

    wo.returnVisitAlertCount = (wo.returnVisitAlertCount || 0) + 1;
    wo.lastReturnVisitAlertFiredAt = now;
    await wo.save();
  },
});

registerBroadcastRule({
  key: "workOrder.invoiceAccountsEscalation",
  findDue: async (now) => {
    const completedStatus = await WODynamicStatus.findOne({
      name: "Completed",
    });
    if (!completedStatus) {
      console.warn(
        '[WorkOrderBroadcastRules] No "Completed" WODynamicStatus found — skipping.',
      );
      return [];
    }

    return WorkOrder.find({
      dynamicStatus: completedStatus._id,
      invoicePending: true,
      invoiceUploaded: { $ne: true },
      completeDate: {
        $ne: null,
        $lte: addDays(now, -ACCOUNTS_ESCALATION_DAYS),
      },
      accountsInvoiceEscalationSent: { $ne: true },
    });
  },
  fire: async (wo) => {
    await notifyInternalUsers({
      eventType: "WORK_ORDER_INVOICE_ACCOUNTS_ESCALATION",
      title: "No Invoice 3 Weeks After Completion — Call Vendor",
      message: `${wo.workOrderNumber} was marked Completed on ${wo.completeDate.toLocaleDateString()} and still has no invoice. Please phone the vendor.`,
      entityType: "WorkOrder",
      entityId: wo._id,
      metadata: { workOrderNumber: wo.workOrderNumber },
    }).catch(console.error);

    wo.accountsInvoiceEscalationSent = true;
    await wo.save();
  },
});
