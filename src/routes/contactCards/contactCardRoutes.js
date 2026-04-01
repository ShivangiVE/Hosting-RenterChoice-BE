const express = require("express");
const { protect, authorize } = require("../../middleware/authMiddleware");
const {
  getContactsList,
  createContact,
  getContactDetails,
  bulkDeleteContacts,
} = require("../../controllers/contactCards/contactCardController");

const router = express.Router();

const ALLOWED_ROLES = [
  "Admin",
  "OfficeAdmin",
  "AccountsTeam",
  "RepairsTeam",
  "LeaseTeam",
  "MarketingTeam",
  "LandlordsTeam",
  "InspectionClerk",
];

/* ======================================================
   CONTACTS (Unified Contact Cards)
====================================================== */

//  CREATE individual contact
router.post("/create", protect, authorize(...ALLOWED_ROLES), createContact);

// Unified contacts list
router.get("/", protect, authorize(...ALLOWED_ROLES), getContactsList);

router.get("/:id", protect, authorize(...ALLOWED_ROLES), getContactDetails);

// Bulk Delete Contacts
router.post(
  "/bulk-delete",
  protect,
  authorize(...ALLOWED_ROLES),
  bulkDeleteContacts,
);

module.exports = router;
