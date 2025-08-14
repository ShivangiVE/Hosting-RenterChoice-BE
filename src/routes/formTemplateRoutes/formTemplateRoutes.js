const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../../middleware/authMiddleware");
const {
  createFormTemplate,
  updateFormTemplate,
  listTemplates,
  getActiveTemplateByType,
  deleteTemplate,
  toggleTemplateStatus,
} = require("../../controllers/formTemplate/formTemplateController");

// Only Admin and OfficeAdmin can create/update templates
router.use(protect, authorize("Admin", "OfficeAdmin"));

router.post("/", createFormTemplate);
router.put("/:id", updateFormTemplate);
router.get("/getForms", listTemplates);
router.get("/type/:type", getActiveTemplateByType);
router.patch("/:id/status", toggleTemplateStatus);
router.delete("/:id", deleteTemplate);

module.exports = router;
