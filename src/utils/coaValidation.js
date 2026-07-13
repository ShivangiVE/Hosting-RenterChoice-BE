const { ACCOUNT_TYPES } = require("../constants/coaConstants");

const validateAccountNumber = (accountType, accountNumber) => {
  return String(accountNumber)[0] === ACCOUNT_TYPES[accountType]?.prefix;
};

module.exports = {
  validateAccountNumber,
};
