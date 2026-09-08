const modules = [require("./core"), require("./workOrder")];

const NOTIFICATION_TYPES = {};
const NOTIFICATION_EVENTS = {};
const NOTIFICATION_CATEGORIES = {};

for (const mod of modules) {
  Object.assign(NOTIFICATION_TYPES, mod.types || {});
  Object.assign(NOTIFICATION_EVENTS, mod.events || {});
  Object.assign(NOTIFICATION_CATEGORIES, mod.categories || {});
}

const TYPE_TO_CATEGORY = {};
Object.values(NOTIFICATION_CATEGORIES).forEach((cat) => {
  (cat.types || []).forEach((t) => {
    TYPE_TO_CATEGORY[t] = cat.key;
  });
});

module.exports = {
  NOTIFICATION_TYPES,
  NOTIFICATION_EVENTS,
  NOTIFICATION_CATEGORIES,
  TYPE_TO_CATEGORY,
};
