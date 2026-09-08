const ALLOWED_INVOICE_MIMES = ["image/jpeg", "image/png", "application/pdf"];

/**
 * Verifies a file's actual content (magic bytes) matches an allowed
 * invoice type — not just the client-supplied mimetype/extension, both
 * of which repairUpload.js's invoiceFileFilter already checks but which
 * are still spoofable. Call this AFTER multer has written the file to
 * disk (req.file.path), before it's pushed to permanent storage.
 */
exports.verifyInvoiceFileSignature = async (filePath) => {
  const { fileTypeFromFile } = await import("file-type"); 

  const detected = await fileTypeFromFile(filePath);

  if (!detected || !ALLOWED_INVOICE_MIMES.includes(detected.mime)) {
    const err = new Error(
      "File content does not match an allowed invoice type (JPG, PNG, PDF).",
    );
    err.statusCode = 400;
    throw err;
  }

  return detected;
};
