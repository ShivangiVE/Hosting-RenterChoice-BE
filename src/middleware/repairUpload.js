const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Utility function to create storage for a given folder
const createStorage = (folderName) => {
  const uploadDir = path.join(__dirname, `../../uploads/Repair/${folderName}`);

  // Ensure the folder exists
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  return multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueName = Date.now() + "-" + file.originalname;
      cb(null, uniqueName);
    },
  });
};

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "application/pdf",
    "video/mp4",
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only jpg, png, pdf, mp4 allowed."), false);
  }
};

// Create different uploaders
const workOrderUpload = multer({
  storage: createStorage("workOrders"),
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
});

// Service Agreement Uploads
const serviceAgreementUpload = multer({
  storage: createStorage("serviceAgreements"),
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Task Uploads
const taskUpload = multer({
  storage: createStorage("tasks"),
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ToDo Upload
const todoUpload = multer({
  storage: createStorage("todos"),
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
});

module.exports = {
  workOrderUpload,
  serviceAgreementUpload,
  taskUpload,
  todoUpload,
};
