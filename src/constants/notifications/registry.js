const modules = [require("./core"), require("./workOrder")];

const NOTIFICATION_TYPES = {};
const NOTIFICATION_EVENTS = {};

for (const mod of modules) {
  Object.assign(NOTIFICATION_TYPES, mod.types || {});
  Object.assign(NOTIFICATION_EVENTS, mod.events || {});
}

module.exports = { NOTIFICATION_TYPES, NOTIFICATION_EVENTS };
