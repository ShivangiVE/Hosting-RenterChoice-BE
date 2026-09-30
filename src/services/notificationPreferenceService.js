const NotificationPreference = require("../models/NotificationPreference");
const {
  NOTIFICATION_CATEGORIES,
} = require("../constants/notifications/registry");
const {
  SNOOZE_OPTIONS,
  SNOOZE_DURATION_VALUES,
} = require("../constants/notifications/snoozeOptions");

const categoriesForRole = (role) =>
  Object.values(NOTIFICATION_CATEGORIES).filter(
    (c) => c.roles.includes(role) && !c.mandatory,
  );

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
    const categoryDef = NOTIFICATION_CATEGORIES[key];

    if (categoryDef?.mandatory) {
      const err = new Error(
        `${categoryDef.label} is mandatory and cannot be configured.`,
      );
      err.statusCode = 400;
      throw err;
    }

    if (categoryDef?.frequencyLocked) {
      const offendingField = ["appFrequency", "emailFrequency"].find(
        (field) => val[field] && val[field] !== "immediately",
      );
      if (offendingField) {
        const err = new Error(
          `${categoryDef.label} is time-sensitive and can only be set to "immediately".`,
        );
        err.statusCode = 400;
        throw err;
      }
    }

    pref.categories.set(key, {
      ...(pref.categories.get(key)?.toObject() || {}),
      ...val,
    });
  });

  await pref.save();
  return pref;
};

const getCategoryPreference = async (userId, categoryKey) => {
  const categoryDef = NOTIFICATION_CATEGORIES[categoryKey];

  // Mandatory categories always go out on every channel, whatever is saved.
  if (categoryDef?.mandatory) {
    return {
      emailEnabled: true,
      inAppEnabled: true,
      pushEnabled: true,
      appFrequency: "immediately",
      emailFrequency: "immediately",
    };
  }

  const pref = await getPreferences(userId);
  return (
    pref.categories.get(categoryKey) || {
      emailEnabled: false,
      inAppEnabled: true,
      pushEnabled: true,
      appFrequency: "immediately",
      emailFrequency: "immediately",
    }
  );
};

const getSnoozeSettings = async (userId) => {
  const pref = await getPreferences(userId);
  return pref.snoozeSettings;
};

const updateSnoozeSettings = async (userId, updates = {}) => {
  const pref = await getPreferences(userId);

  if (typeof updates.enabled === "boolean") {
    pref.snoozeSettings.enabled = updates.enabled;
  }

  if (updates.defaultDuration !== undefined) {
    if (!SNOOZE_DURATION_VALUES.includes(updates.defaultDuration)) {
      const err = new Error(
        `defaultDuration must be one of: ${SNOOZE_DURATION_VALUES.join(", ")}`,
      );
      err.statusCode = 400;
      throw err;
    }
    pref.snoozeSettings.defaultDuration = updates.defaultDuration;
  }

  await pref.save();
  return pref.snoozeSettings;
};

const resolveSnoozeUntil = async (userId, requestedDuration) => {
  const settings = await getSnoozeSettings(userId);

  if (!settings.enabled) {
    const err = new Error(
      "Snoozing is turned off in your notification settings.",
    );
    err.statusCode = 400;
    throw err;
  }

  const duration = requestedDuration || settings.defaultDuration;
  const option = SNOOZE_OPTIONS.find((opt) => opt.value === duration);

  if (!option) {
    const err = new Error(
      `duration must be one of: ${SNOOZE_OPTIONS.map((o) => o.value).join(", ")}`,
    );
    err.statusCode = 400;
    throw err;
  }

  return new Date(Date.now() + option.ms);
};

module.exports = {
  categoriesForRole,
  getPreferences,
  updatePreferences,
  getCategoryPreference,
  getSnoozeSettings,
  updateSnoozeSettings,
  resolveSnoozeUntil,
};
