const asyncHandler =
  (fn, { duplicateMessage } = {}) =>
  async (req, res, next) => {
    try {
      return await fn(req, res, next);
    } catch (err) {
      if (err?.code === 11000 && duplicateMessage) {
        err.message = duplicateMessage;
      }
      return next(err);
    }
  };

module.exports = asyncHandler;
