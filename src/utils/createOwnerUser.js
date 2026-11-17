const crypto = require("crypto");
const User = require("../models/User");

/**
 * Creates the Owner login (User) behind an Owner contact.
 *
 * - Random, never-shown password: staff never know it. The account starts as
 *   accountStatus "invited"; the owner sets their own password from the invite
 *   email sent when they're attached to a portfolio (ownerInviteService).
 *   "Forgot Password" also activates it (proves email ownership).
 * - Sends NO email itself — an owner card created from Contacts has no
 *   portfolio yet, so the invite goes out only on portfolio attach.
 * - Runs inside the caller's transaction (session) so the contact and the
 *   user are created together or not at all.
 * - Caller is responsible for the duplicate-email check before calling.
 *
 * @param {object} contact  validated contact payload (preferredName, legalName,
 *                          primaryEmail [already normalized], phones)
 * @param {object} actor    req.user (who is creating it)
 * @param {ClientSession} session
 * @returns {Promise<User>}
 */
async function createOwnerUser(contact, actor, session) {
  const legalName = String(contact.legalName || "").trim();
  const [firstName, ...rest] = legalName.split(/\s+/).filter(Boolean);

  const [user] = await User.create(
    [
      {
        role: "Owner",
        email: contact.primaryEmail, // normalized by the caller
        preferredName: String(contact.preferredName).trim(),
        legalName: legalName || undefined,
        // Owner lists show firstName / lastName
        firstName: firstName || String(contact.preferredName).trim(),
        lastName: rest.join(" ") || undefined,
        contactInfo: contact.phones?.mobile?.trim() || undefined,
        // Unusable until the owner claims the invite (hashed by the User pre-save hook)
        password: crypto.randomBytes(32).toString("hex"),
        accountStatus: "invited",
        createdBy: actor?._id,
      },
    ],
    { session },
  );

  return user;
}

module.exports = { createOwnerUser };
