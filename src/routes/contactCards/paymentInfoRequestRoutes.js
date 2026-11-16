const express = require("express");
const { protect, authorize } = require("../../middleware/authMiddleware");
const { PAYMENT_INFO_REVIEWER_ROLES } = require("../../constants/roles");
const {
  getMyCompanyPaymentInfo,
  submitPaymentInfoChangeRequest,
  withdrawMyPaymentInfoRequest,
  getPaymentInfoChangeRequest,
  revealProposedAccountNumber,
  reviewPaymentInfoChangeRequest,
} = require("../../controllers/contactCards/paymentInfoRequestController");

const router = express.Router();

// ── Vendor (declared before "/:id") ──
router.get("/mine", protect, authorize("Vendor"), getMyCompanyPaymentInfo);
router.post("/", protect, authorize("Vendor"), submitPaymentInfoChangeRequest);
router.patch(
  "/mine/withdraw",
  protect,
  authorize("Vendor"),
  withdrawMyPaymentInfoRequest,
);

// ── Office Admin / Internal Team / Admin ──
router.get(
  "/:id",
  protect,
  authorize(...PAYMENT_INFO_REVIEWER_ROLES),
  getPaymentInfoChangeRequest,
);
router.get(
  "/:id/reveal",
  protect,
  authorize(...PAYMENT_INFO_REVIEWER_ROLES),
  revealProposedAccountNumber,
);
router.patch(
  "/:id/review",
  protect,
  authorize(...PAYMENT_INFO_REVIEWER_ROLES),
  reviewPaymentInfoChangeRequest,
);

module.exports = router;
