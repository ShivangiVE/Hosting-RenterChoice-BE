exports.sendSuccess = (res, message, data = {}, statusCode = 200) => {
  return res.status(statusCode).json({
    status: true,
    message,
    data,
  });
};

exports.sendError = (res, message, statusCode = 400) => {
  return res.status(statusCode).json({
    status: false,
    message,
  });
};
