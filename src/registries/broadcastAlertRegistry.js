// Registry of "daily sweep, team-wide alert" rules — the pattern used by
// the Work Order Return-Visit/Invoice-Escalation alerts (and, in spirit,
// the Service Agreement cycle alerts). Each module registers its own rules
// here instead of writing a whole new processor file. The generic engine
// in processors/broadcastAlertProcessor.js is the ONLY thing that ever
// runs these — it doesn't know anything about Work Orders specifically.
//
// A rule:
//   key      — unique string, for logging
//   findDue  — async (now) => [docs currently due for an alert]
//   fire     — async (doc, now) => send the notification AND persist
//              whatever flag/timestamp stops it firing again next sweep

const rules = [];

function registerBroadcastRule(rule) {
  if (!rule.key || !rule.findDue || !rule.fire) {
    throw new Error(
      "[BroadcastAlertRegistry] key, findDue, and fire are all required",
    );
  }
  if (rules.some((r) => r.key === rule.key)) {
    throw new Error(`[BroadcastAlertRegistry] Duplicate rule key: ${rule.key}`);
  }
  rules.push(rule);
}

function getBroadcastRules() {
  return rules;
}

module.exports = { registerBroadcastRule, getBroadcastRules };
