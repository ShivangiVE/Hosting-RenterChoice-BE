const express = require("express");
const cors = require("cors");
const path = require("path");

const adminRoutes = require("./src/routes/admin");
const officeAdminRoutes = require("./src/routes/officeAdminRoutes");
const authRoutes = require("./src/routes/externalUsers/auth");
const externalUsers = require("./src/routes/externalUsers/externalUsersRoutes");
const internalAuthRoutes = require("./src/routes/internalUsers/auth");
const uploadRoutes = require("./src/routes/profileUploadRoutes");
const errorHandler = require("./src/middleware/errorHandler");
const formTemplateRoutes = require("./src/routes/formTemplateRoutes/formTemplateRoutes");
const buildingPortfolioRoutes = require("./src/routes/building/buildingPortfolioRoutes");
const inspectionMarketingRoutes = require("./src/routes/inspectionMarketingRoutes/inspectionMarketingRoutes");
const formUploadRoutes = require("./src/routes/uploadRoutes/uploadRoutes");
const workOrderRoutes = require("./src/routes/workOrderRoutes/workOrderRoutes");
const taskRoutes = require("./src/routes/taskRoutes/taskRoutes");
const todosRoutes = require("./src/routes/taskRoutes/todoRoutes");
const repairCategories = require("./src/routes/workOrderRoutes/repairCategoriesRoutes");
const woDynamicStatusRoutes = require("./src/routes/workOrderRoutes/woDynamicStatusRoutes");
const noteCategoryRoutes = require("./src/routes/notes&Documents/noteCategoryRoutes");
const internalUsers = require("./src/routes/internalUsers/internalUserRoutes");
const noteRoutes = require("./src/routes/notes&Documents/noteRoutes");
const documentRoutes = require("./src/routes/notes&Documents/DocumentRoutes");
const auditRoutes = require("./src/routes/auditRoutes/auditRoutes");
const advertisingRoutes = require("./src/routes/advertising/advertisingRoutes");
const exportRoutes = require("./src/routes/exportRoutes/exportRoutes");
const notificationRoutes = require("./src/routes/notificationRoutes/notificationRoutes");
const conversationRoutes = require("./src/routes/communication/conversationRoutes");
const messageRoutes = require("./src/routes/communication/messageRoutes");
const userPreferenceRoutes = require("./src/routes/userPreferenceRoutes/userPreferenceRoutes");
const companyRoutes = require("./src/routes/contactCards/companyRoutes");
const vendorTypeRoutes = require("./src/routes/contactCards/vendorTypeRoutes");

const app = express();
app.use(cors());
app.use(express.json());

// Serve /uploads folder statically
app.use("/uploads", express.static("uploads"));

app.get("/", (req, res) => {
  res.send("API is working");
});

app.use("/api/auth", authRoutes);
app.use("/api/externalUsers", externalUsers);
app.use("/api/internalauth", internalAuthRoutes);
app.use("/api/internalUsers", internalUsers);
app.use("/api/admin", adminRoutes);
app.use("/api/officeAdmin", officeAdminRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/forms/templates", formTemplateRoutes);
app.use("/api/forms/uploads", formUploadRoutes);
app.use("/api/submissions", buildingPortfolioRoutes);
app.use("/api/submissions", inspectionMarketingRoutes);
app.use("/api/work-orders", workOrderRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/todos", todosRoutes);
app.use("/api/categories", repairCategories);
app.use("/api/work-orders/dynamicstatuses", woDynamicStatusRoutes);
app.use("/api/note-categories", noteCategoryRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/advertising", advertisingRoutes);
app.use("/api/download", exportRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api", userPreferenceRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/vendor-types", vendorTypeRoutes);

app.use(errorHandler);

module.exports = app;
