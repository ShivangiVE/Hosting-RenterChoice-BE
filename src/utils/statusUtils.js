exports.normalizeStatusName = (str) => {
  if (!str) return "";
  return str.trim().toLowerCase();
};

exports.formatDisplayName = (str) => {
  if (!str) return "";
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};
