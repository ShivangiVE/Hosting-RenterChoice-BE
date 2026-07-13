const cron = require("node-cron");
const Invoice = require("../models/Accounts/Invoice");
const { deleteFile } = require("../utils/storageService");

const STALE_AFTER_HOURS = 24;

async function cleanupAbandonedInvoiceDrafts() {
  const cutoff = new Date(Date.now() - STALE_AFTER_HOURS * 60 * 60 * 1000);

  const staleDrafts = await Invoice.find({
    status: "pending_confirmation",
    createdAt: { $lt: cutoff },
  });

  for (const draft of staleDrafts) {
    try {
      await deleteFile(draft.fileUrl);
      await draft.deleteOne();
    } catch (err) {
      console.error(
        `Failed to clean up abandoned invoice draft ${draft._id}:`,
        err.message,
      );
    }
  }

  if (staleDrafts.length > 0) {
    console.log(`Cleaned up ${staleDrafts.length} abandoned invoice draft(s)`);
  }
}

function startInvoiceDraftCleanupJob() {
  // Run daily at 3 AM
  cron.schedule("0 3 * * *", cleanupAbandonedInvoiceDrafts);
}

module.exports = { startInvoiceDraftCleanupJob, cleanupAbandonedInvoiceDrafts };
