const Invoice = require("../../models/Accounts/Invoice");
const WorkOrder = require("../../models/WorkOrder");
const ServiceAgreement = require("../../models/ServiceAgreement");
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
const {
  assignBillNumberIfMissing,
} = require("../../utils/generateAccountNumber");
const NoteCategory = require("../../models/Notes&Documents/NoteCategory");
const Document = require("../../models/Notes&Documents/Document");
const { getFileType } = require("../../utils/fileType");

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

    if (workOrder.invoiceUploaded) {
      return sendError(
        res,
        "An invoice has already been uploaded for this work order",
        409,
      );
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

exports.createServiceAgreementInvoiceDraft = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return sendError(res, "Invoice file is required", 400);

    const serviceAgreement = await ServiceAgreement.findById(id);
    if (!serviceAgreement)
      return sendError(res, "Service agreement not found", 404);

    if (
      req.user.role === "Vendor" &&
      serviceAgreement.vendor?.toString() !== req.user._id.toString()
    ) {
      return sendError(res, "Not authorized", 403);
    }

    if (serviceAgreement.vendorResponse !== "accepted") {
      return sendError(
        res,
        "You must accept this service agreement before uploading invoices",
        403,
      );
    }

    const fileUrl = await uploadFile(req.file, "uploads/Repair/invoices");

    const extracted = await extractInvoiceData({
      filePath: req.file.path,
      mimeType: req.file.mimetype,
    });

    const invoice = await Invoice.create({
      serviceAgreement: id,
      vendor: serviceAgreement.vendor,
      fileUrl,
      originalFileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      status: "pending_confirmation",
      extractedData: extracted,
    });

    return sendSuccess(res, "Invoice processed", {
      invoiceId: invoice._id,
      serviceAgreementNumber: serviceAgreement.serviceAgreementNumber,
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

    if (workOrder.invoiceUploaded) {
      return sendError(
        res,
        "An invoice has already been uploaded for this work order",
        409,
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

exports.finalizeServiceAgreementInvoice = async (req, res) => {
  try {
    const { id } = req.params; // serviceAgreement id
    const { invoiceId } = req.body;

    const serviceAgreement = await ServiceAgreement.findById(id);
    if (!serviceAgreement)
      return sendError(res, "Service agreement not found", 404);

    if (
      req.user.role === "Vendor" &&
      serviceAgreement.vendor?.toString() !== req.user._id.toString()
    ) {
      return sendError(res, "Not authorized", 403);
    }

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return sendError(res, "Invoice not found", 404);
    if (invoice.serviceAgreement?.toString() !== id) {
      return sendError(
        res,
        "Invoice does not belong to this service agreement",
        400,
      );
    }
    if (invoice.status !== "confirmed") {
      return sendError(res, "Invoice must be confirmed before finalizing", 400);
    }

    let invoiceCategory = await NoteCategory.findOne({ name: "Invoice" });
    if (!invoiceCategory) {
      invoiceCategory = await NoteCategory.create({
        name: "Invoice",
        createdBy: req.user._id,
      });
    }

    const doc = await Document.create({
      fileName: invoice.originalFileName,
      originalFileName: invoice.originalFileName,
      description: invoice.confirmedData?.comments || "",
      category: invoiceCategory._id,
      fileType: getFileType(invoice.mimeType),
      mimeType: invoice.mimeType,
      fileSize: invoice.fileSize,
      fileUrl: invoice.fileUrl,
      sourceType: "serviceAgreement",
      sourceId: id,
      uploadedBy: req.user._id,
    });
    serviceAgreement.invoiceUploaded = true;
    serviceAgreement.lastInvoiceUploadedAt = new Date();
    serviceAgreement.invoiceDocuments.push(doc._id);
    await serviceAgreement.save();

    invoice.status = "posted";
    await invoice.save();

    await notifyInternalUsers({
      eventType: "SERVICE_AGREEMENT_INVOICE_UPLOADED",
      title: "Service Agreement Invoice Uploaded",
      message: `An invoice was uploaded for ${serviceAgreement.serviceAgreementNumber}`,
      entityType: "ServiceAgreement",
      entityId: serviceAgreement._id,
    }).catch(console.error);

    return sendSuccess(res, "Invoice uploaded successfully", {
      serviceAgreement,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to finalize service agreement invoice",
      500,
    );
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
