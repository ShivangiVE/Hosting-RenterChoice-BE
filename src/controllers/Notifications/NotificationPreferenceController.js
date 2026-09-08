const {
  getPreferences,
  updatePreferences,
  categoriesForRole,
} = require("../../services/notificationPreferenceService");
const { sendSuccess } = require("../../utils/response");

exports.getCategories = async (req, res) => {
  return sendSuccess(
    res,
    "Categories fetched",
    categoriesForRole(req.user.role),
  );
};

exports.getMyPreferences = async (req, res) => {
  const pref = await getPreferences(req.user._id);
  return sendSuccess(res, "Preferences fetched", pref);
};

exports.updateMyPreferences = async (req, res) => {
  const pref = await updatePreferences(req.user._id, req.body.categories);
  return sendSuccess(res, "Preferences updated", pref);
};

exports.getFrequencyOptions = async (req, res) => {
  return sendSuccess(res, "Frequency options fetched", [
    { value: "immediately", label: "Immediately" },
    { value: "every15min", label: "Every 15 Minutes" },
    { value: "every30min", label: "Every 30 Minutes" },
    { value: "hourly", label: "Hourly" },
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
  ]);
};
