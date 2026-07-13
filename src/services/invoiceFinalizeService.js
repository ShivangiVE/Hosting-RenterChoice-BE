const mongoose = require("mongoose");
const Document = require("../models/Notes&Documents/Document");
const NoteCategory = require("../models/Notes&Documents/NoteCategory");
const Invoice = require("../models/Accounts/Invoice");
const { getFileType } = require("../utils/fileType");

exports.finalizeInvoice = async (workOrder, invoiceId, userId) => {
  const session = await mongoose.startSession();

  try {
    let document;

    await session.withTransaction(async () => {
      const invoice = await Invoice.findById(invoiceId).session(session);
      if (!invoice) throw new Error("Invoice not found");
      if (invoice.status !== "confirmed") {
        throw new Error(
          "Invoice must be confirmed before completing the work order",
        );
      }

      let invoiceCategory = await NoteCategory.findOne({
        name: "Invoice",
      }).session(session);
      if (!invoiceCategory) {
        invoiceCategory = await NoteCategory.create(
          [{ name: "Invoice", createdBy: userId }],
          { session },
        ).then((docs) => docs[0]);
      }

      const [createdDocument] = await Document.create(
        [
          {
            fileName: invoice.originalFileName,
            originalFileName: invoice.originalFileName,
            description: invoice.confirmedData.comments || "",
            category: invoiceCategory._id,
            fileType: getFileType(invoice.mimeType),
            mimeType: invoice.mimeType,
            fileSize: invoice.fileSize,
            fileUrl: invoice.fileUrl,
            workOrder: workOrder._id,
            uploadedBy: userId,
          },
        ],
        { session },
      );
      document = createdDocument;

      invoice.document = document._id;
      await invoice.save({ session });

      workOrder.invoice = invoice._id;
      workOrder.invoiceStatus = "confirmed";
      workOrder.invoiceUploaded = true;
      workOrder.invoicePending = false;
      await workOrder.save({ session });
    });

    return document;
  } finally {
    await session.endSession();
  }
};
