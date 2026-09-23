/**
 * Escapes user input before using it in a RegExp.
 * Without this, a search like "a(" throws, and "^.*" matches everything.
 */
const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "contains" search, case-insensitive — use for all user search inputs. */
const toSearchRegex = (value = "", flags = "i") =>
  new RegExp(escapeRegex(String(value).trim()), flags);

/** Exact match, case-insensitive — e.g. duplicate-name checks. */
const toExactRegex = (value = "", flags = "i") =>
  new RegExp(`^${escapeRegex(String(value).trim())}$`, flags);

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes a value before inserting it into HTML (prevents XSS). */
const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

module.exports = { escapeRegex, toSearchRegex, toExactRegex, escapeHtml };
