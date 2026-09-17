const {
  SNOOZE_OPTIONS,
} = require("../../constants/notifications/snoozeOptions");
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
  try {
    const pref = await updatePreferences(req.user._id, req.body.categories);
    return sendSuccess(res, "Preferences updated", pref);
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getFrequencyOptions = async (req, res) => {
  return sendSuccess(res, "Frequency options fetched", [
    { value: "immediately", label: "Real-time" },

    { value: "daily", label: "Daily" },
    { value: "every3days", label: "Every 3 Days" },
    { value: "weekly", label: "Weekly" },
  ]);
};

exports.getSnoozeOptions = async (req, res) => {
  return sendSuccess(
    res,
    "Snooze options fetched",
    SNOOZE_OPTIONS.map(({ value, label }) => ({ value, label })),
  );
};

exports.getMySnoozeSettings = async (req, res) => {
  const settings = await getSnoozeSettings(req.user._id);
  return sendSuccess(res, "Snooze settings fetched", settings);
};

exports.updateMySnoozeSettings = async (req, res) => {
  try {
    const settings = await updateSnoozeSettings(req.user._id, req.body);
    return sendSuccess(res, "Snooze settings updated", settings);
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message,
    });
  }
};
