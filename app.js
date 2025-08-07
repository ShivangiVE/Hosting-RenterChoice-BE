const express = require("express");
const cors = require("cors");
const path = require("path");

const adminRoutes = require("./src/routes/admin");
const officeAdminRoutes = require("./src/routes/officeAdminRoutes");
const authRoutes = require("./src/routes/externalUsers/auth");
const internalAuthRoutes = require("./src/routes/internalUsers/auth");
const uploadRoutes = require("./src/routes/profileUploadRoutes");
const errorHandler = require("./src/middleware/errorHandler");

const app = express();
app.use(cors());
app.use(express.json());

// Serve /uploads folder statically
app.use("/uploads", express.static("uploads"));

app.get("/", (req, res) => {
  res.send("API is working");
});

app.use("/api/auth", authRoutes);
app.use("/api/internalauth", internalAuthRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/officeAdmin", officeAdminRoutes);
app.use("/api/upload", uploadRoutes);

app.use(errorHandler);

module.exports = app;
