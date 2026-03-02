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

module.exports = { generateAccountNumber };
