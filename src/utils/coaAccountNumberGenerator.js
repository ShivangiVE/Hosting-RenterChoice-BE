const { ACCOUNT_TYPES } = require("../constants/coaConstants");
const { generateAccountNumber } = require("./generateAccountNumber");

const generateCOAAccountNumber = async (accountType) => {
  const config = ACCOUNT_TYPES[accountType];

  if (!config) {
    throw new Error("Invalid account type");
  }

  return String(
    await generateAccountNumber({
      counterId: config.counterId,
      startFrom: config.startFrom,
      minDigits: 4,
      maxDigits: 4,
    }),
  );
};

module.exports = {
  generateCOAAccountNumber,
};
