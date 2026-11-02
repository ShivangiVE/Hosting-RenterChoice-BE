const SupportContact = require("../models/SupportContact");


const EDITABLE = ["email", "phone", "textNumber", "hours"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d\s().-]{7,30}$/;

// Single source of truth = DB
async function getSupportContact(key = "default") {
  const doc = await SupportContact.findOne({ key }).lean();
  const result = { companyName: "Renter's Choice" };
  EDITABLE.forEach((f) => {
    result[f] = doc?.[f] || "";
  });
  result.updatedAt = doc?.updatedAt || null;
  return result;
}

function validateSupportContact(body = {}) {
  const errors = [];
  const value = {};

  EDITABLE.forEach((f) => {
    if (body[f] !== undefined) value[f] = String(body[f] ?? "").trim();
  });

  if (value.email && !EMAIL_RE.test(value.email))
    errors.push("Enter a valid email address");
  if (value.phone && !PHONE_RE.test(value.phone))
    errors.push("Enter a valid phone number");
  if (value.textNumber && !PHONE_RE.test(value.textNumber))
    errors.push("Enter a valid text number");

  return { value, errors };
}

module.exports = { getSupportContact, validateSupportContact };
