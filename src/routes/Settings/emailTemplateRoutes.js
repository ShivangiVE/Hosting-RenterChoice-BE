const express = require("express");
const { protect, authorize } = require("../../middleware/authMiddleware");
const {
  createEmailTemplate,
  getEmailTemplates,
  getEmailTemplateDropdown,
  getEmailTemplateById,
  updateEmailTemplate,
  toggleEmailTemplateStatus,
  deleteEmailTemplate,
} = require("../../controllers/Settings/emailTemplateController");

const router = express.Router();
const adminOnly = [protect, authorize("Admin")];

router.get("/templateList", protect, getEmailTemplateDropdown);

router.post("/create", ...adminOnly, createEmailTemplate);
router.get("/", ...adminOnly, getEmailTemplates);
router.get("/:id", protect, getEmailTemplateById);
router.put("/:id", ...adminOnly, updateEmailTemplate);
router.patch("/:id/status", ...adminOnly, toggleEmailTemplateStatus);
router.delete("/:id", ...adminOnly, deleteEmailTemplate);

module.exports = router;
