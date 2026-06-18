const express = require("express");

const { protect, authorize } = require("../../middleware/authMiddleware");

const {
  createAccount,
  getAccounts,
  getAccountsDropdown,
  getSubAccounts,
  getAccountById,
  updateAccount,
  previewAccountNumber,
  archiveAccount,
} = require("../../controllers/Accounts/coaController");

const router = express.Router();

router.post("/create", protect, authorize("Admin"), createAccount);

router.get(
  "/preview-number",
  protect,
  authorize("Admin"),
  previewAccountNumber,
);

router.get("/", protect, getAccounts);

router.get("/dropdown", protect, getAccountsDropdown);

router.get("/:id", protect, getAccountById);

router.get("/:accountId/subaccounts", protect, getSubAccounts);

router.put("/:id", protect, authorize("Admin"), updateAccount);

router.delete("/:id", protect, authorize("Admin"), archiveAccount);

module.exports = router;
