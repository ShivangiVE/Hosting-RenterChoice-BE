const { sendError } = require("../utils/response");

const isProd = process.env.NODE_ENV === "production";

const resolveError = (err, res) => {
  // Mongo duplicate key (unique index)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    return {
      status: 409,
      code: "DUPLICATE_RECORD",
      message: err.message?.startsWith("E11000")
        ? `${field || "Record"} already exists`
        : err.message,
    };
  }

  // Mongoose schema validation (required, enum, maxlength...)
  if (err.name === "ValidationError") {
    return {
      status: 400,
      code: "VALIDATION_ERROR",
      message:
        Object.values(err.errors || {})
          .map((e) => e.message)
          .join(", ") || err.message,
    };
  }

  // Invalid ObjectId
  if (err.name === "CastError") {
    return { status: 400, code: "INVALID_ID", message: `Invalid ${err.path}` };
  }

  // Malformed JSON body
  if (err.type === "entity.parse.failed") {
    return {
      status: 400,
      code: "INVALID_JSON",
      message: "Invalid JSON payload",
    };
  }

  const status =
    err.statusCode ||
    err.status ||
    (res.statusCode !== 200 ? res.statusCode : 500);

  return {
    status,
    code: err.errorCode || (status >= 500 ? "SERVER_ERROR" : "REQUEST_ERROR"),
    message:
      status >= 500 && isProd
        ? "Something went wrong"
        : err.message || "Server Error",
  };
};

const errorHandler = (err, req, res, next) => {
  const { status, code, message } = resolveError(err, res);

  if (status >= 500) {
    console.error(`[${req.method}] ${req.originalUrl}`, err);
  }

  return sendError(res, message, status, code);
};

module.exports = errorHandler;
