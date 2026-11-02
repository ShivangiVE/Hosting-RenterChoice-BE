
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, "")) 
  .filter(Boolean);

module.exports = allowedOrigins;
