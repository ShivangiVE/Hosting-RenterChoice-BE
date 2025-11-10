const AdvertisingMedia = require("../../models/AdvertisingMedia");
const { sendError, sendSuccess } = require("../../utils/response");
const fs = require("fs");
const path = require("path");

// Helper function to determine media type
const getMediaType = (mimeType) => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return null;
};

// Upload advertising media
exports.uploadAdvertisingMedia = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return sendError(res, "No files uploaded", 400);
    }

    // Create media records
    const uploadedMedia = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const mediaType = getMediaType(file.mimetype);

      if (!mediaType) {
        // Clean up uploaded files
        req.files.forEach((file) => {
          try {
            fs.unlinkSync(file.path);
          } catch (unlinkErr) {
            console.error("Error deleting file:", unlinkErr);
          }
        });
        return sendError(res, "Invalid file type", 400);
      }

      const media = await AdvertisingMedia.create({
        fileName: file.originalname,
        mediaType: mediaType,
        mimeType: file.mimetype,
        fileSize: file.size,
        fileUrl: `/uploads/advertising/${mediaType}s/${file.filename}`,
        uploadedBy: req.user._id,
      });

      await media.populate("uploadedBy", "preferredName email");
      uploadedMedia.push(media);
    }

    return sendSuccess(
      res,
      "Media uploaded successfully",
      { media: uploadedMedia },
      201
    );
  } catch (err) {
    console.error("Error uploading media:", err);
    // Clean up uploaded files on error
    if (req.files) {
      req.files.forEach((file) => {
        try {
          fs.unlinkSync(file.path);
        } catch (unlinkErr) {
          console.error("Error deleting file:", unlinkErr);
        }
      });
    }
    return sendError(res, err.message || "Failed to upload media", 500);
  }
};

// Get media by type
exports.getMediaByType = async (req, res) => {
  try {
    const { mediaType } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!["image", "video"].includes(mediaType)) {
      return sendError(res, "Invalid media type", 400);
    }

    const filter = { mediaType, isActive: true };

    const [media, total] = await Promise.all([
      AdvertisingMedia.find(filter)
        .populate("uploadedBy", "preferredName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AdvertisingMedia.countDocuments(filter),
    ]);

    return sendSuccess(res, "Media fetched successfully", {
      media,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Error fetching media by type:", err);
    return sendError(res, err.message || "Failed to fetch media", 500);
  }
};

// Delete media
exports.deleteMedia = async (req, res) => {
  try {
    const { id } = req.params;

    const media = await AdvertisingMedia.findById(id);
    if (!media) {
      return sendError(res, "Media not found", 404);
    }

    // Delete the physical file
    const filePath = path.join(__dirname, "../../", media.fileUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await media.deleteOne();

    return sendSuccess(res, "Media deleted successfully");
  } catch (err) {
    console.error("Error deleting media:", err);
    return sendError(res, err.message || "Failed to delete media", 500);
  }
};

// Toggle media active status
exports.toggleMediaStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const media = await AdvertisingMedia.findById(id);
    if (!media) {
      return sendError(res, "Media not found", 404);
    }

    media.isActive = !media.isActive;
    await media.save();

    return sendSuccess(res, "Media status updated successfully", {
      media: {
        id: media._id,
        isActive: media.isActive,
      },
    });
  } catch (err) {
    console.error("Error toggling media status:", err);
    return sendError(res, err.message || "Failed to toggle media status", 500);
  }
};
