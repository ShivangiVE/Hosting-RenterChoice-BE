const fs = require("fs");
const path = require("path");
const multer = require("multer");

// Ensure the uploads folder exists
const uploadDir = path.resolve("uploads"); // Always resolves to project root
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true }); // Ensures parent folders are created if not exist
}

// Configure where and how the files will be stored
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // Use the absolute path
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${file.fieldname}${ext}`);
  },
});

// Optional: Add file filter or limits if needed
const profileUpload = multer({ storage });

module.exports = profileUpload;
