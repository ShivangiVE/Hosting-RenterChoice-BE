const path = require("path");
const fs = require("fs/promises");
const sharp = require("sharp");

exports.processImageFile = async (file) => {
  try {
    const targetWidth = 850;
    const targetHeight = 550;

    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const baseName = path.basename(file.originalname, ext);

    const processedFilename = `${baseName}.jpg`;
    const processedFilePath = path.join(
      path.dirname(file.path),
      processedFilename
    );

    // Resize + compress
    await sharp(file.path)
      .resize(targetWidth, targetHeight, {
        fit: "cover",
        position: "center",
      })
      .jpeg({ quality: 85 })
      .toFile(processedFilePath);

    const stats = await fs.stat(processedFilePath);

    // DO NOT DELETE ORIGINAL (Windows gives EPERM)
    // await fs.unlink(file.path);

    // Return processed file info
    return {
      ...file,
      path: processedFilePath,
      size: stats.size,
      filename: processedFilename,
      originalname: file.originalname,
      mimetype: "image/jpeg",
    };
  } catch (err) {
    console.error("Image processing error:", err);
    throw err;
  }
};
