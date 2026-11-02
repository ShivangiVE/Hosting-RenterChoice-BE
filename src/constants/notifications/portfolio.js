module.exports = {
  types: {
    PORTFOLIO_OWNER_LINKED: "PORTFOLIO_OWNER_LINKED",
  },
  // No `events` entry on purpose: this notification is sent only to the
  // portfolio's own office (portfolioNotificationService), not fanned out
  // to every user of a role via notifyInternalUsers.
  events: {},
  categories: {},
};
