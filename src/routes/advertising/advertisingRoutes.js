const express = require("express");
const { authorize, protect } = require("../../middleware/authMiddleware");
const advertisingUpload = require("../../middleware/advertisingUpload");
const {
  uploadAdvertisingMedia,
  getMediaByType,
  deleteMedia,
  toggleMediaStatus,
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

// Toggle media status
router.patch(
  "/:id/toggle-status",
  protect,
  authorize(...ALLOWED_ROLES),
  toggleMediaStatus
);

module.exports = router;
