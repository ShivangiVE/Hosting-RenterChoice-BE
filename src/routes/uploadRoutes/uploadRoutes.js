const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { protect } = require("../../middleware/authMiddleware");
const {
  uploadFormFile,
} = require("../../controllers/uploadsController/uploadsController");

// Ensure `uploads/forms` folder exists
const formsUploadDir = path.resolve("uploads/forms");
if (!fs.existsSync(formsUploadDir)) {
  fs.mkdirSync(formsUploadDir, { recursive: true });
}

// Multer storage for form files
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, formsUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${file.fieldname}${ext}`);
  },
});

const upload = multer({ storage });

// POST /api/forms/upload-file
router.post("/upload-file", protect, upload.single("file"), uploadFormFile);

module.exports = router;
