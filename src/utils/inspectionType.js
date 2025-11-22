exports.normalize = (str) =>
  str
    ?.trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "") || "";

// Master list of accepted names mapped to categories
exports.TYPE_MAP = {
  marketing: /^marketing$/i,

  moveout: /^(move[-\s]?out)$/i,
  moveoutinspection: /^(move[-\s]?out(\s+inspection)?|moveoutinspection)$/i,
};
