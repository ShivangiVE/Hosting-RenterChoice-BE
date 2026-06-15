const ACCOUNT_TYPES = {
  BANK: {
    prefix: "1",
    startFrom: 1000,
    counterId: "coaBank",
  },

  LIABILITY: {
    prefix: "2",
    startFrom: 2000,
    counterId: "coaLiability",
  },

  RE: {
    prefix: "3",
    startFrom: 3000,
    counterId: "coaRE",
  },

  INCOME: {
    prefix: "4",
    startFrom: 4000,
    counterId: "coaIncome",
  },

  EXPENSE: {
    prefix: "5",
    startFrom: 5000,
    counterId: "coaExpense",
  },
};

module.exports = {
  ACCOUNT_TYPES,
};
