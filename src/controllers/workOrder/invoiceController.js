const WorkOrder = require("../../models/WorkOrder");
const Invoice = require("../../models/Accounts/Invoice");
const { extractInvoiceData } = require("../../services/invoiceExtraction");
const { finalizeInvoice } = require("../../services/invoiceFinalizeService");
const {
  uploadFile,
  deleteFile,
  getFileViewUrl,
} = require("../../utils/storageService");
const { sendError, sendSuccess } = require("../../utils/response");
const { completeWorkOrder } = require("../../domain/workOrderState");
const {
  resolveReminders,
} = require("../../services/notificationReminderService");
const {
  notifyInternalUsers,
} = require("../../services/internalNotificationService");
const { assignBillNumberIfMissing } = require("../../utils/generateAccountNumber");

exports.createInvoiceDraft = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return sendError(res, "Invoice file is required", 400);

    const workOrder = await WorkOrder.findById(id);
    if (!workOrder) return sendError(res, "Work order not found", 404);

    if (
      req.user.role === "Vendor" &&
      workOrder.vendor?.toString() !== req.user._id.toString()
    ) {
      return sendError(res, "Not authorized", 403);
    }

    const fileUrl = await uploadFile(req.file, "uploads/Repair/invoices");

    const extracted = await extractInvoiceData({
      filePath: req.file.path,
      mimeType: req.file.mimetype,
    });

    const invoice = await Invoice.create({
      workOrder: id,
      vendor: workOrder.vendor,
      fileUrl,
      originalFileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      status: "pending_confirmation",
      extractedData: extracted,
    });

    workOrder.invoiceStatus = "review_required";
    await workOrder.save();

    return sendSuccess(res, "Invoice processed", {
      invoiceId: invoice._id,
      workOrderNumber: workOrder.workOrderNumber,
      extracted,
    });
  } catch (err) {
    return sendError(res, err.message || "Invoice extraction failed", 500);
  }
};

exports.confirmInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { invoiceNumber, amount, comments } = req.body;

    if (!invoiceNumber?.trim())
      return sendError(res, "Invoice number is required", 400);
    if (amount === undefined || isNaN(amount))
      return sendError(res, "A valid amount is required", 400);

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return sendError(res, "Invoice not found", 404);

    if (["confirmed", "posted"].includes(invoice.status)) {
      return sendError(res, "This invoice has already been confirmed", 400);
    }

    if (
      req.user.role === "Vendor" &&
      invoice.vendor?.toString() !== req.user._id.toString()
    ) {
      return sendError(res, "Not authorized", 403);
    }

    invoice.confirmedData = {
      invoiceNumber: invoiceNumber.trim(),
      amount: parseFloat(amount),
      comments: comments?.trim() || "",
    };
    invoice.status = "confirmed";
    invoice.confirmedAt = new Date();
    await invoice.save();

    await WorkOrder.findByIdAndUpdate(invoice.workOrder, {
      invoiceStatus: "confirmed",
      invoice: invoice._id,
    });

    return sendSuccess(res, "Invoice confirmed", { invoice });
  } catch (err) {
    return sendError(res, err.message || "Failed to confirm invoice", 500);
  }
};

exports.finalizeInvoiceLater = async (req, res) => {
  try {
    const { id } = req.params;
    const { invoiceId } = req.body;

    const workOrder = await WorkOrder.findById(id)
      .populate("dynamicStatus", "name")
      .populate("building");
    if (!workOrder) return sendError(res, "Work order not found", 404);

    if (
      req.user.role === "Vendor" &&
      workOrder.vendor?.toString() !== req.user._id.toString()
    ) {
      return sendError(res, "Not authorized", 403);
    }

    if (workOrder.dynamicStatus?.name !== "Completed") {
      return sendError(
        res,
        "Invoice can only be uploaded after work order is completed",
        400,
      );
    }

    await finalizeInvoice(workOrder, invoiceId, req.user._id);

    // ── Assign bill number now that the invoice is finalized ──────────
    await assignBillNumberIfMissing(invoiceId);

    await completeWorkOrder(workOrder, {
      invoiceUploaded: true,
      validateKey: false,
    });
    await workOrder.save();

    await notifyInternalUsers({
      eventType: "INVOICE_UPLOADED",
      title: "Invoice Uploaded",
      message: `Invoice uploaded for ${workOrder.workOrderNumber}`,
      entityType: "WorkOrder",
      entityId: workOrder._id,
    }).catch(console.error);

    await resolveReminders(workOrder._id, "INVOICE_UPLOAD_PENDING");

    return sendSuccess(res, "Invoice uploaded successfully", { workOrder });
  } catch (err) {
    return sendError(res, err.message || "Failed to finalize invoice", 500);
  }
};

exports.getInvoiceFileUrl = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await Invoice.findById(invoiceId).select(
      "fileUrl vendor workOrder",
    );
    if (!invoice) return sendError(res, "Invoice not found", 404);

    // Authorization: vendors can only view their own invoices
    if (
      req.user.role === "Vendor" &&
      invoice.vendor?.toString() !== req.user._id.toString()
    ) {
      return sendError(res, "Not authorized", 403);
    }

    const url = await getFileViewUrl(invoice.fileUrl);
    if (!url) return sendError(res, "No invoice file available", 404);

    return sendSuccess(res, "Invoice file URL generated", { url });
  } catch (err) {
    return sendError(res, err.message || "Failed to get invoice file", 500);
  }
};

exports.discardInvoiceDraft = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return sendError(res, "Invoice not found", 404);

    if (invoice.status !== "pending_confirmation") {
      return sendError(res, "This invoice can no longer be discarded", 400);
    }

    if (
      req.user.role === "Vendor" &&
      invoice.vendor?.toString() !== req.user._id.toString()
    ) {
      return sendError(res, "Not authorized", 403);
    }

    await deleteFile(invoice.fileUrl);
    await invoice.deleteOne();

    await WorkOrder.findByIdAndUpdate(invoice.workOrder, {
      invoiceStatus: "not_uploaded",
    });

    return sendSuccess(res, "Invoice draft discarded");
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to discard invoice draft",
      500,
    );
  }
};
