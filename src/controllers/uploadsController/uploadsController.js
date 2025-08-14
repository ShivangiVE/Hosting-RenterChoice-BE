const { sendSuccess, sendError } = require("../../utils/response");

// This controller only returns the uploaded file URL (local storage example)
exports.uploadFormFile = async (req, res) => {
  try {
    if (!req.file) return sendError(res, "File required", 400);

    // Form files stored in `/uploads/forms`
    const fileUrl = `/uploads/forms/${req.file.filename}`;
    return sendSuccess(res, "Form file uploaded", { url: fileUrl }, 201);
  } catch (err) {
    return sendError(res, err.message || "Upload failed", 500);
  }
};
