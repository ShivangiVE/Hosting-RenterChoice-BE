const MODULES = {
  ACCOUNTS: "accounts",
  FRANCHISE_SETTINGS: "franchiseSettings",
  USER_MANAGEMENT: "userManagement",
  EXPANSION_TEAMS: "expansionTeams",
};

const ACTIONS = {
  VIEW: "view",
  CREATE: "create",
  EDIT: "edit",
  DELETE: "delete",
  WORKFLOW: "workflow", // e.g. approve/complete/reconcile actions inside Accounts
};

// role -> module -> allowed actions
const PERMISSION_MATRIX = {
  Admin: {
    [MODULES.ACCOUNTS]: ["view", "create", "edit", "delete", "workflow"],
    [MODULES.FRANCHISE_SETTINGS]: ["view", "create", "edit", "delete"],
    [MODULES.USER_MANAGEMENT]: ["view", "create", "edit", "delete"],
    [MODULES.EXPANSION_TEAMS]: ["view", "create", "edit", "delete"],
  },
  BrokerageAdmin: {
    [MODULES.ACCOUNTS]: ["view", "create", "edit", "delete", "workflow"],
    [MODULES.FRANCHISE_SETTINGS]: [], // no Master Admin setup/templates access
    [MODULES.USER_MANAGEMENT]: ["view", "create", "edit", "delete"], // their own Brokerage/Expansion Team users
    [MODULES.EXPANSION_TEAMS]: ["view", "create", "edit", "delete"],
  },
  BrokerageAccounts: {
    [MODULES.ACCOUNTS]: ["view", "create", "edit", "delete", "workflow"], // full accounts access
    [MODULES.FRANCHISE_SETTINGS]: [],
    [MODULES.USER_MANAGEMENT]: [], // cannot edit users/setup
    [MODULES.EXPANSION_TEAMS]: ["view"], // read-only visibility, no edits
  },
  BrokerageUser: {
    [MODULES.ACCOUNTS]: ["view"], // view only, can't create/edit/delete/workflow
    [MODULES.FRANCHISE_SETTINGS]: [],
    [MODULES.USER_MANAGEMENT]: [],
    [MODULES.EXPANSION_TEAMS]: ["view"],
  },
};

function can(role, module, action) {
  return Boolean(PERMISSION_MATRIX[role]?.[module]?.includes(action));
}

module.exports = { MODULES, ACTIONS, PERMISSION_MATRIX, can };
