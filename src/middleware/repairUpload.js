const multer = require("multer");
const path = require("path");
const fs = require("fs");

const sanitizeFilename = (originalname) => {
  const base = path.basename(originalname);
  return base.replace(/[^a-zA-Z0-9.\-_]/g, "_");
};

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
      const safeName = sanitizeFilename(file.originalname);
      const uniqueName = `${Date.now()}-${safeName}`;
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

const INVOICE_ALLOWED_MIMETYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
];

const INVOICE_ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".pdf"];

const invoiceFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  const mimetypeOk = INVOICE_ALLOWED_MIMETYPES.includes(file.mimetype);
  const extensionOk = INVOICE_ALLOWED_EXTENSIONS.includes(ext);

  if (mimetypeOk && extensionOk) {
    return cb(null, true);
  }

  return cb(
    new Error(
      "Invalid file type. Only JPG, PNG, and PDF files are allowed for invoices.",
    ),
    false,
  );
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

// Invoice Uploads (vendor invoice drafts + upload-later flow)
const invoiceUpload = multer({
  storage: createStorage("invoices"),
  fileFilter: invoiceFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

module.exports = {
  workOrderUpload,
  serviceAgreementUpload,
  taskUpload,
  todoUpload,
  invoiceUpload,
};
