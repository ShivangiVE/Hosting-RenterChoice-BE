const express = require("express");
const cors = require("cors");
const path = require("path");

const adminRoutes = require("./src/routes/admin");
const officeAdminRoutes = require("./src/routes/officeAdminRoutes");
const authRoutes = require("./src/routes/externalUsers/auth");
const internalAuthRoutes = require("./src/routes/internalUsers/auth");
const uploadRoutes = require("./src/routes/profileUploadRoutes");
const errorHandler = require("./src/middleware/errorHandler");
const formTemplateRoutes = require("./src/routes/formTemplateRoutes/formTemplateRoutes");
const buildingPortfolioRoutes = require("./src/routes/building/buildingPortfolioRoutes");
const formUploadRoutes = require("./src/routes/uploadRoutes/uploadRoutes");

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
app.use("/api/forms/templates", formTemplateRoutes);
app.use("/api/forms/uploads", formUploadRoutes);
app.use("/api/submissions", buildingPortfolioRoutes);

app.use(errorHandler);

module.exports = app;
