const { getIO } = require("../../socket");
const Notification = require("../models/Notification");

exports.createNotification = async ({
  user,
  role,
  type,
  title,
  message,
  entityType,
  entityId,
  metadata = {},
}) => {
  const notification = await Notification.create({
    user,
    role,
    type,
    title,
    message,
    entityType,
    entityId,
    metadata,
  });

  getIO().to(`user:${user.toString()}`).emit("notification:new", {
    notification,
  });

  return notification;
};
