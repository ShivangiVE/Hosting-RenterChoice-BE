const express = require("express");
const { sendMessage } = require("../../controllers/communication/message");
const { protect } = require("../../middleware/authMiddleware");

const router = express.Router();

// Send message
router.post("/", protect, sendMessage);

module.exports = router;
