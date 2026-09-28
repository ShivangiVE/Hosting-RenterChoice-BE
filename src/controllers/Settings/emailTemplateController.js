const mongoose = require("mongoose");
const EmailTemplate = require("../../models/Settings/EmailTemplate");
const { htmlToText, sanitizeEmailHtml } = require("../../utils/htmlUtils");
const { toSearchRegex } = require("../../utils/stringUtils");
const asyncHandler = require("../../middleware/asyncHandler");
const { sendSuccess, sendError } = require("../../utils/response");

const LIMITS = { title: 120, subject: 255, body: 50000 };

const handler = (fn) =>
  asyncHandler(fn, {
    duplicateMessage: "A template with this title already exists",
  });

// Safely trims a value; anything that isn't a string becomes ""
const clean = (value) => (typeof value === "string" ? value.trim() : "");

const normalizePayload = (body = {}) => ({
  title: body.title?.trim() ?? "",
  subject: body.subject?.trim() ?? "",
  body: sanitizeEmailHtml(clean(body.body)),
});

const validatePayload = ({ title, subject, body }) => {
  if (!title) return "Title is required";
  if (title.length > LIMITS.title)
    return `Title cannot exceed ${LIMITS.title} characters`;
  if (!subject) return "Subject is required";
  if (subject.length > LIMITS.subject)
    return `Subject cannot exceed ${LIMITS.subject} characters`;
  if (!htmlToText(body)) return "Message is required";
  return null;
};

const findTemplate = (id) =>
  mongoose.isValidObjectId(id)
    ? EmailTemplate.findOne({ _id: id, isDeleted: false })
    : null;

const toPositiveInt = (value, fallback, max = Infinity) =>
  Math.min(Math.max(parseInt(value, 10) || fallback, 1), max);

// =========================
// Controllers
// =========================

exports.createEmailTemplate = handler(async (req, res) => {
  const payload = normalizePayload(req.body);
  const error = validatePayload(payload);
  if (error) return sendError(res, error, 400);

  const template = await EmailTemplate.create({
    ...payload,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  return sendSuccess(res, "Email template created", { template }, 201);
});

exports.getEmailTemplates = handler(async (req, res) => {
  const { search, status } = req.query;
  const page = toPositiveInt(req.query.page, 1);
  const limit = toPositiveInt(req.query.limit, 10, 100);

  const filter = { isDeleted: false };
  if (status === "active") filter.isActive = true;
  if (status === "inactive") filter.isActive = false;
  if (search?.trim()) {
    const rx = toSearchRegex(search);
    filter.$or = [{ title: rx }, { subject: rx }];
  }

  const [templates, total] = await Promise.all([
    EmailTemplate.find(filter)
      .select("-body -titleKey")
      .populate("updatedBy", "preferredName")

      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    EmailTemplate.countDocuments(filter),
  ]);

  return sendSuccess(res, "Email templates fetched", {
    templates,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  });
});

/** Dropdown for send-mail screens: titles + the subject/message to fill in */
exports.getEmailTemplateDropdown = handler(async (req, res) => {
  const templates = await EmailTemplate.find({
    isActive: true,
    isDeleted: false,
  })
    .select("_id title subject body")
    .sort({ title: 1 })
    .lean();

  return sendSuccess(res, "Email templates dropdown", {
    templates: templates.map((t) => ({
      value: t._id,
      label: t.title,
      subject: t.subject,
      body: t.body,
    })),
  });
});

exports.getEmailTemplateById = handler(async (req, res) => {
  const template = await findTemplate(req.params.id)?.lean();
  if (!template) return sendError(res, "Email template not found", 404);
  return sendSuccess(res, "Email template fetched", { template });
});

exports.updateEmailTemplate = handler(async (req, res) => {
  const template = await findTemplate(req.params.id);
  if (!template) return sendError(res, "Email template not found", 404);

  const payload = normalizePayload(req.body);
  const error = validatePayload(payload);
  if (error) return sendError(res, error, 400);

  Object.assign(template, payload, { updatedBy: req.user._id });
  await template.save();

  return sendSuccess(res, "Email template updated", { template });
});

exports.toggleEmailTemplateStatus = handler(async (req, res) => {
  const { isActive } = req.body;
  if (typeof isActive !== "boolean")
    return sendError(res, "isActive must be a boolean", 400);

  const template = await findTemplate(req.params.id);
  if (!template) return sendError(res, "Email template not found", 404);

  template.isActive = isActive;
  template.updatedBy = req.user._id;
  await template.save();

  return sendSuccess(
    res,
    `Email template ${isActive ? "activated" : "deactivated"}`,
    { template },
  );
});

exports.deleteEmailTemplate = handler(async (req, res) => {
  const template = await findTemplate(req.params.id);
  if (!template) return sendError(res, "Email template not found", 404);

  Object.assign(template, {
    isDeleted: true,
    isActive: false,
    deletedAt: new Date(),
    deletedBy: req.user._id,
  });
  await template.save();

  return sendSuccess(res, "Email template deleted");
});
