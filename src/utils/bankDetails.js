const Bank = require("../models/Accounts/Bank");
const { encryptField } = require("./fieldEncryption");

const TRANSIT = /^\d{5}$/;
const DIGITS = /^\d+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function validateBankDetails(input, { optional = false } = {}) {
  const src = input && typeof input === "object" ? input : {};
  const d = {
    bankId: str(src.bankId, 50),
    transit: str(src.transit, 5),
    accountNumber: str(src.accountNumber, 30),
    confirmAccountNumber: str(src.confirmAccountNumber, 30),
    billingFirstName: str(src.billingFirstName, 80),
    billingLastName: str(src.billingLastName, 80),
    billingAddress: str(src.billingAddress, 250),
    billingEmail: str(src.billingEmail, 254).toLowerCase(),
  };

  if (optional && !Object.values(d).some(Boolean)) {
    return { errors: [], value: null };
  }

  const errors = [];

  let bank = null;
  if (!d.bankId) {
    errors.push("Bank selection is required.");
  } else {
    bank = await Bank.findOne({ _id: d.bankId, isActive: true })
      .select("name institutionNumber accountNumberMin accountNumberMax")
      .lean()
      .catch(() => null);
    if (!bank) errors.push("Selected bank is invalid or no longer available.");
  }

  if (!TRANSIT.test(d.transit)) {
    errors.push("Transit number must be exactly 5 digits.");
  }

  if (!DIGITS.test(d.accountNumber)) {
    errors.push("Account number must contain digits only.");
  } else if (
    bank &&
    (d.accountNumber.length < bank.accountNumberMin ||
      d.accountNumber.length > bank.accountNumberMax)
  ) {
    errors.push(
      `Account number must be between ${bank.accountNumberMin} and ${bank.accountNumberMax} digits for ${bank.name}.`,
    );
  }

  if (d.accountNumber !== d.confirmAccountNumber) {
    errors.push("Account number and confirmation do not match.");
  }

  if (!d.billingFirstName) errors.push("Billing first name is required.");
  if (!d.billingLastName) errors.push("Billing last name is required.");
  if (d.billingEmail && !EMAIL.test(d.billingEmail)) {
    errors.push("Billing email is invalid.");
  }

  if (errors.length) return { errors, value: null };

  return {
    errors,
    value: {
      bankId: bank._id,
      bankName: bank.name,
      institutionNumber: bank.institutionNumber,
      transit: d.transit,
      accountNumberLast4: d.accountNumber.slice(-4),
      accountNumberEncrypted: encryptField(d.accountNumber),
      billingFirstName: d.billingFirstName,
      billingLastName: d.billingLastName,
      billingAddress: d.billingAddress,
      billingEmail: d.billingEmail,
    },
  };
}

module.exports = { validateBankDetails };
