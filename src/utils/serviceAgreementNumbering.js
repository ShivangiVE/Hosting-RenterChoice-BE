

const ALPHABET_SIZE = 26;
const CHAR_CODE_A = "a".charCodeAt(0);

/**
 * Convert a 1-indexed cycle number into its bijective base-26 letter suffix.
 *   cycleNumberToLetters(1)  -> "a"
 *   cycleNumberToLetters(26) -> "z"
 *   cycleNumberToLetters(27) -> "aa"
 *   cycleNumberToLetters(28) -> "ab"
 *   cycleNumberToLetters(52) -> "az"
 *   cycleNumberToLetters(53) -> "ba"
 *
 * cycleNumber is the stored source of truth on each ServiceAgreement
 * document (`cycleNumber`) — always derive the letter from it rather than
 * incrementing the previous letter string, so there is exactly one place
 * this arithmetic happens.
 */
function cycleNumberToLetters(cycleNumber) {
  if (!Number.isInteger(cycleNumber) || cycleNumber < 1) {
    throw new Error("cycleNumber must be a positive integer");
  }

  let n = cycleNumber;
  let result = "";

  while (n > 0) {
    const remainder = ((n - 1) % ALPHABET_SIZE) + 1; // 1-26, never 0
    result = String.fromCharCode(CHAR_CODE_A + remainder - 1) + result;
    n = Math.floor((n - 1) / ALPHABET_SIZE);
  }

  return result;
}

/**
 * Build the full display number for a cycle.
 *   buildCycleAgreementNumber("SA #0072", "a")  -> "SA #0072a"
 *   buildCycleAgreementNumber("SA #0072", null) -> "SA #0072"  (non-recurring)
 */
function buildCycleAgreementNumber(baseNumber, cycleLetter) {
  return cycleLetter ? `${baseNumber}${cycleLetter}` : baseNumber;
}

module.exports = {
  cycleNumberToLetters,
  buildCycleAgreementNumber,
};
