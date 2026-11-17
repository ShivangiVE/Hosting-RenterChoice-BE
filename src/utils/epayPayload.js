const Bank = require("../models/Accounts/Bank");

const EPAY_VALIDATION = {
  transit: /^\d{5}$/,
};

// Same rules as before (moved here unchanged from companyController)
async function validateEpayPayload(body) {
  const errors = [];
  const {
    bankId,
    transit,
    accountNumber,
    confirmAccountNumber,
    billingFirstName,
    billingLastName,
    billingEmail,
  } = body;

  let bank = null;
  if (!bankId) {
    errors.push("Bank selection is required.");
  } else {
    bank = await Bank.findOne({ _id: bankId, isActive: true });
    if (!bank) {
      errors.push("Selected bank is invalid or no longer available.");
    }
  }

  if (!transit || !EPAY_VALIDATION.transit.test(transit)) {
    errors.push("Transit number must be exactly 5 digits.");
  }

  if (bank) {
    if (!accountNumber || !/^\d+$/.test(accountNumber)) {
      errors.push("Account number must contain digits only.");
    } else if (
      accountNumber.length < bank.accountNumberMin ||
      accountNumber.length > bank.accountNumberMax
    ) {
      errors.push(
        `Account number must be between ${bank.accountNumberMin} and ${bank.accountNumberMax} digits for ${bank.name}.`,
      );
    }
  }

  if (accountNumber !== confirmAccountNumber) {
    errors.push("Account number and confirmation do not match.");
  }

  if (!billingFirstName?.trim()) errors.push("Billing first name is required.");
  if (!billingLastName?.trim()) errors.push("Billing last name is required.");
  if (billingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) {
    errors.push("Billing email is invalid.");
  }

  return { errors, bank };
}

const clean = (v, max = 200) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** Only the fields we store — extra keys from the client are ignored */
const pickEpayInput = (body = {}) => ({
  bankInfoMethod: body.bankInfoMethod === "echeck" ? "echeck" : "eft",
  bankId: clean(body.bankId, 24),
  transit: clean(body.transit, 5),
  accountNumber: clean(body.accountNumber, 20),
  confirmAccountNumber: clean(body.confirmAccountNumber, 20),
  billingFirstName: clean(body.billingFirstName, 100),
  billingLastName: clean(body.billingLastName, 100),
  billingAddress: clean(body.billingAddress, 300),
  billingEmail: clean(body.billingEmail, 120),
});

/** Masked view — never includes the full account number */
const toPublicEpay = (epay) =>
  epay?.bankId
    ? {
        bankInfoMethod: epay.bankInfoMethod,
        bankId: epay.bankId,
        bankName: epay.bankName,
        institutionNumber: epay.institutionNumber,
        transit: epay.transit,
        accountNumberLast4: epay.accountNumberLast4,
        billingFirstName: epay.billingFirstName,
        billingLastName: epay.billingLastName,
        billingAddress: epay.billingAddress,
        billingEmail: epay.billingEmail,
        updatedAt: epay.updatedAt || null,
        source: epay.source || null,
      }
    : null;

module.exports = { validateEpayPayload, pickEpayInput, toPublicEpay };
