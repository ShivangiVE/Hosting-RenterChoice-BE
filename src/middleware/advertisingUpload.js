
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Create upload directories
const uploadDir = path.join(__dirname, "../../uploads/advertising");
const imageDir = path.join(uploadDir, "images");
const videoDir = path.join(uploadDir, "videos");

[uploadDir, imageDir, videoDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Determine destination based on file type
    if (file.mimetype.startsWith("image/")) {
      cb(null, imageDir);
    } else if (file.mimetype.startsWith("video/")) {
      cb(null, videoDir);
    } else {
      cb(new Error("Invalid file type"), null);
    }
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
    "image/svg+xml",
    // Videos
    "video/mp4",
    "video/mpeg",
    "video/ogg",
    "video/webm",
    "video/quicktime",
    "video/x-msvideo",
    "video/3gpp",
    "video/3gpp2",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Allowed: images (JPEG, PNG, GIF, WebP, BMP, SVG) and videos (MP4, MPEG, OGG, WebM, MOV, AVI, 3GPP)."
      ),
      false
    );
  }
};

const advertisingUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max per file
    files: 10, // Maximum 10 files per upload
  },
});

module.exports = advertisingUpload;
