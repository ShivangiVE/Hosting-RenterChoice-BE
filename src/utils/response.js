exports.sendSuccess = (res, message, data = {}, statusCode = 200) => {
  return res.status(statusCode).json({
    status: true,
    message,
    data,
  });
};

exports.sendError = (res, message, statusCode) => {
  // If statusCode isn’t passed, decide automatically
  const code = statusCode
    ? statusCode
    : message instanceof Error
    ? 500 // real error object → internal server error
    : 400; // plain string → client error (bad request)

  return res.status(code).json({
    status: false,
    message: message instanceof Error ? message.message : message,
  });
};
