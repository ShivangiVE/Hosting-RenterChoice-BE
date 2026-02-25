const User = require("../../models/User");
const { sendSuccess, sendError } = require("../../utils/response");

exports.updateUserPreferences = async (req, res) => {
  try {
    const { defaultRepairTab, itemsPerPagePreference } = req.body;

    const updateData = {};

    // Repair tab validation
    if (defaultRepairTab) {
      if (!["Work Order", "Tasks"].includes(defaultRepairTab)) {
        return sendError(res, "Invalid tab", 400);
      }
      updateData.defaultRepairTab = defaultRepairTab;
    }

    // Pagination validation
    if (itemsPerPagePreference) {
      if (![10, 25, 50, 100].includes(itemsPerPagePreference)) {
        return sendError(res, "Invalid items per page", 400);
      }
      updateData.itemsPerPagePreference = itemsPerPagePreference;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updateData, {
      new: true,
    });

    return sendSuccess(res, "Preferences updated", {
      defaultRepairTab: user.defaultRepairTab,
      itemsPerPagePreference: user.itemsPerPagePreference,
    });
  } catch (err) {
    return sendError(res, err.message);
  }
};
