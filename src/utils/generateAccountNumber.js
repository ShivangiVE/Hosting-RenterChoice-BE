const Invoice = require("../models/Accounts/Invoice");
const Counter = require("./Counter");

/**
 * Generic atomic account number generator
 * Works with your existing Counter schema
 *
 * @param {string} counterId
 * @param {number} startFrom
 * @param {object} options
 * @returns {string}
 */
const generateAccountNumber = async ({
  counterId,
  startFrom,
  minDigits,
  maxDigits,
  prefix = "",
  pad = false,
}) => {
  try {
    const counter = await Counter.findOneAndUpdate(
      { _id: counterId },
      { $inc: { sequence_value: 1 } },
      {
        new: true,
        upsert: true,
      },
    );

    const rawNumber = startFrom + counter.sequence_value;
    const length = String(rawNumber).length;

    //  HARD BUSINESS GUARD
    if (maxDigits && length > maxDigits) {
      throw new Error(
        `${counterId} exceeded max allowed digits (${maxDigits}). Range exhausted.`,
      );
    }

    // optional padding
    let formattedNumber = String(rawNumber);

    if (pad && minDigits) {
      formattedNumber = formattedNumber.padStart(minDigits, "0");
    }

    return prefix + formattedNumber;
  } catch (err) {
    throw new Error(`Failed to generate account number for ${counterId}`);
  }
};

// Generate Bill Number for Invoice if missing
const assignBillNumberIfMissing = async (invoiceId) => {
  const invoice = await Invoice.findById(invoiceId).select("billNumber status");
  if (!invoice) return null;

  // Never assign a bill number to an invoice that hasn't been confirmed —
  // even if this helper gets called from a new code path later.
  if (!["confirmed", "posted"].includes(invoice.status)) {
    return null;
  }

  if (!invoice.billNumber) {
    invoice.billNumber = await generateAccountNumber({
      counterId: "invoiceBill",
      startFrom: 0,
      prefix: "Bill #",
      pad: false,
    });
    await invoice.save();
  }

  return invoice.billNumber;
};

module.exports = { generateAccountNumber, assignBillNumberIfMissing };
