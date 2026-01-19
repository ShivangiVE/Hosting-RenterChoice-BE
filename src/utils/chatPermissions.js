function canChat(senderRole, receiverRole) {
  const rules = {
    Tenant: ["Admin", "OfficeAdmin", "RepairsTeam"],
    Owner: ["Admin", "AccountsTeam"],
    Vendor: ["Admin", "RepairsTeam"],
    Admin: ["*"],
    OfficeAdmin: ["*"],
    AccountsTeam: ["Admin", "Owner"],
    RepairsTeam: ["Admin", "Vendor", "Tenant"],
  };

  return (
    rules[senderRole]?.includes("*") ||
    rules[senderRole]?.includes(receiverRole)
  );
}

module.exports = {
  canChat,
};
