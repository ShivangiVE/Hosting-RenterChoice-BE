const express = require("express");
const { authorize, protect } = require("../../middleware/authMiddleware");
const advertisingUpload = require("../../middleware/advertisingUpload");
const {
  uploadAdvertisingMedia,
  getMediaByType,
  deleteMedia,
  toggleMediaStatus,
  deleteMultipleMedia,
  downloadAdvertisingMedia,
} = require("../../controllers/Advertising/AdvertisingController");

const router = express.Router();

const ALLOWED_ROLES = ["Admin", "OfficeAdmin", "MarketingTeam"];

// Upload advertising media
router.post(
  "/upload",
  protect,
  authorize(...ALLOWED_ROLES),
  advertisingUpload.array("mediaFiles", 10),
  uploadAdvertisingMedia
);

// Get media by type
router.get(
  "/type/:mediaType",
  protect,
  authorize(...ALLOWED_ROLES),
  getMediaByType
);

// Delete media
router.delete("/:id", protect, authorize(...ALLOWED_ROLES), deleteMedia);

// Delete Multiple Media
router.post(
  "/delete-multiple",
  protect,
  authorize(...ALLOWED_ROLES),
  deleteMultipleMedia
);

// Toggle media status
router.patch(
  "/:id/toggle-status",
  protect,
  authorize(...ALLOWED_ROLES),
  toggleMediaStatus
);

// Download media
router.get(
  "/:id/download",
  protect,
  authorize(...ALLOWED_ROLES),
  downloadAdvertisingMedia
);

module.exports = router;
