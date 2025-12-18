const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Create upload directory
const uploadDir = path.join(__dirname, "../../uploads/documents");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    // Images
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",

    // Videos
    "video/mp4",
    "video/webm",
    "video/ogg",
    "video/quicktime",

    // PDFs
    "application/pdf",
    // Excel
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    // Word
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    // Other common types
    "text/plain",
    "application/zip",
    "application/x-zip-compressed",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Allowed: images, PDF, Excel, Word, text, and zip files."
      ),
      false
    );
  }
};

const documentUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 150 * 1024 * 1024, // 150 MB
  },
});

module.exports = documentUpload;
