const express = require("express");
const { protect, authorize } = require("../../middleware/authMiddleware");
const { ACCOUNTS_ROLES } = require("../../constants/roles");

const router = express.Router();

// ========================= Accounts — /me =========================
// Returns the logged-in user's role + what they can do in Accounts.
// Used by the FE AccountsPermissionContext on first load.
router.get("/me", protect, authorize(...ACCOUNTS_ROLES), (req, res) => {
  const PERMISSIONS = {
    Admin: { canEdit: true, canExport: true, canManageSettings: true },
    BrokerageAdmin: {
      canEdit: true,
      canExport: true,
      canManageSettings: false,
    },
    OfficeAdmin: { canEdit: true, canExport: true, canManageSettings: false },
    AccountsTeam: {
      canEdit: false,
      canExport: false,
      canManageSettings: false,
    },
    LeaseTeam: { canEdit: false, canExport: false, canManageSettings: false },
    LandlordsTeam: {
      canEdit: false,
      canExport: false,
      canManageSettings: false,
    },
  };
  res.json({
    role: req.user.role,
    permissions: PERMISSIONS[req.user.role],
  });
});

// ========================= Summary =========================
// Phase 2 — add controller import and wire here when ready
// router.get("/summary", protect, authorize(...ACCOUNTS_ROLES), getSummary);

// ========================= Invoices =========================
// Phase 3 — add below
// router.get("/invoices", protect, authorize(...ACCOUNTS_ROLES), getInvoices);
// router.post("/invoices", protect, authorize("Admin", "BrokerageAdmin", "OfficeAdmin"), createInvoice);

// ========================= Payments =========================
// Phase 4 — add below
// router.post("/payments", protect, authorize("Admin", "OfficeAdmin"), createPayment);

// ========================= Export =========================
// Phase 5 — add below
// router.get("/export", protect, authorize("Admin", "BrokerageAdmin"), exportAccounts);

module.exports = router;
