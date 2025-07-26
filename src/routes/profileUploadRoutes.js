const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/profileUpload");
const User = require("../models/User");

router.post("/profile", protect, upload.single("profileImage"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  try {
    // Update the current logged-in user's profileImage in the DB
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id, // from protect middleware
      { profileImage: `/uploads/${req.file.filename}` },
      { new: true } // return the updated doc
    );

    res.status(200).json({
      message: "Profile image uploaded",
      filePath: updatedUser.profileImage,
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error updating profile image:", error);
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router;
