const NotificationPreference = require("../models/NotificationPreference");
const {
  NOTIFICATION_CATEGORIES,
} = require("../constants/notifications/registry");

const categoriesForRole = (role) =>
  Object.values(NOTIFICATION_CATEGORIES).filter((c) => c.roles.includes(role));
// (add a `roles: ["vendor"]` / `["inspection"]` array to each category definition in Step 2)

const getPreferences = async (userId) => {
  let pref = await NotificationPreference.findOne({ user: userId });
  if (!pref)
    pref = await NotificationPreference.create({
      user: userId,
      categories: {},
    });
  return pref;
};

const updatePreferences = async (userId, categoryUpdates) => {
  const pref = await getPreferences(userId);
  Object.entries(categoryUpdates).forEach(([key, val]) => {
    pref.categories.set(key, {
      ...(pref.categories.get(key)?.toObject() || {}),
      ...val,
    });
  });
  await pref.save();
  return pref;
};

const getCategoryPreference = async (userId, categoryKey) => {
  const pref = await getPreferences(userId);
  return (
    pref.categories.get(categoryKey) || {
      emailEnabled: false,
      inAppEnabled: true,
      frequency: "immediately",
    }
  );
};

module.exports = {
  categoriesForRole,
  getPreferences,
  updatePreferences,
  getCategoryPreference,
};
