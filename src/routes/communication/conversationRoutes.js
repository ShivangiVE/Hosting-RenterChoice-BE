const express = require("express");
const {
  createConversation,
  getConversations,
  getMessages,
  getConversationByWorkOrder,
  getConversationByServiceAgreement,
} = require("../../controllers/communication/conversation");
const { protect } = require("../../middleware/authMiddleware");
const router = express.Router();

// Create or get conversation
router.post("/", protect, createConversation);

// Get user's conversations
router.get("/", protect, getConversations);

// Get Conversation by work order
router.get("/work-order/:workOrderId", protect, getConversationByWorkOrder);

router.get(
  "/service-agreement/:serviceAgreementId",
  protect,
  getConversationByServiceAgreement,
);

// Get messages for a conversation
router.get("/:conversationId/messages", protect, getMessages);

module.exports = router;
