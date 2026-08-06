const fs = require("fs");
const path = require("path");

let AWS, s3;
const isS3 = process.env.USE_S3 === "true";

// Lazy-load AWS SDK only if using S3
if (isS3) {
  try {
    AWS = require("aws-sdk");
    s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
    });
  } catch (err) {
    console.warn(
      "⚠️ AWS SDK not installed. Run 'npm install aws-sdk' when enabling USE_S3=true.",
    );
  }
}

/**
 * Upload file to S3 or keep locally
 * @param {object} file - Multer file object
 * @param {string} targetFolder - Folder path in S3 or local directory (e.g. 'uploads/advertising/images')
 * @returns {string} - The file URL (S3 URL or local path)
 */
const uploadFile = async (file, targetFolder = "uploads") => {
  try {
    if (isS3 && s3) {
      const fileStream = fs.createReadStream(file.path);
      const s3Key = `${targetFolder}/${file.filename}`;

      const uploadResult = await s3
        .upload({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: s3Key,
          Body: fileStream,
          ContentType: file.mimetype,
        })
        .promise();

      // After successful upload, delete local temp file
      fs.unlinkSync(file.path);

      console.log(" Uploaded to S3:", uploadResult.Location);
      return uploadResult.Location; // full S3 URL
    } else {
      // Local path handling
      return `/${targetFolder}/${file.filename}`;
    }
  } catch (err) {
    console.error(" Error uploading file:", err);
    throw err;
  }
};

/**
 * Get full file path (for local storage)
 */
const getLocalPath = (relativePath) => {
  const cleanPath = relativePath.startsWith("/")
    ? relativePath.substring(1)
    : relativePath;
  return path.join(process.cwd(), cleanPath);
};

/**
 * Delete a file (works for local or S3)
 */
const deleteFile = async (fileUrl) => {
  if (!fileUrl) return;

  try {
    if (isS3 && s3) {
      const s3Key = fileUrl.split(".amazonaws.com/")[1];
      if (!s3Key) throw new Error("Invalid S3 key in fileUrl");

      await s3
        .deleteObject({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: s3Key,
        })
        .promise();

      console.log("Deleted from S3:", s3Key);
    } else {
      const filePath = getLocalPath(fileUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log("Deleted local file:", filePath);
      } else {
        console.warn("File not found for deletion:", filePath);
      }
    }
  } catch (err) {
    console.error("Error deleting file:", err);
  }
};

/**
 * Check if file exists (local only)
 */
const fileExists = (fileUrl) => {
  if (isS3) return true; // Assume exists, S3 handles persistence
  const filePath = getLocalPath(fileUrl);
  return fs.existsSync(filePath);
};

/**
 * Get file stream (for downloads)
 */
const getFileStream = (fileUrl) => {
  if (isS3 && s3) {
    const s3Key = fileUrl.split(".amazonaws.com/")[1];
    return s3
      .getObject({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key,
      })
      .createReadStream();
  } else {
    const filePath = getLocalPath(fileUrl);
    return fs.createReadStream(filePath);
  }
};

/**
 * Get a viewable URL for a stored file.
 * - S3: returns a short-lived signed URL (bucket can stay private)
 * - Local: returns an absolute URL the browser can open directly
 */
const getFileViewUrl = async (fileUrl) => {
  if (!fileUrl) return null;

  if (isS3 && s3) {
    const s3Key = fileUrl.split(".amazonaws.com/")[1];

    if (!s3Key) {
      throw new Error("Invalid S3 key in fileUrl");
    }

    return s3.getSignedUrlPromise("getObject", {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: s3Key,
      Expires: 300,
    });
  }

  // const serverPublicUrl = process.env.SERVER_PUBLIC_URL;
  const serverPublicUrl ="https://hosting-renterchoice-be.onrender.com";

  if (!serverPublicUrl) {
    throw new Error("SERVER_PUBLIC_URL environment variable is not configured");
  }

  const normalizedBaseUrl = serverPublicUrl.replace(/\/+$/, "");
  const normalizedFileUrl = fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`;
  console.log("hosted on Render :: ",`${normalizedBaseUrl}${normalizedFileUrl}`)
  return `${normalizedBaseUrl}${normalizedFileUrl}`;
};

module.exports = {
  uploadFile,
  deleteFile,
  fileExists,
  getFileStream,
  getFileViewUrl,
};
