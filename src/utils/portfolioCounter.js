const Counter = require("../utils/Counter");

const generatePortfolioAccountNumber = async () => {
  try {
    const counter = await Counter.findOneAndUpdate(
      { _id: "portfolioAccountNumber" },
      { $inc: { sequence_value: 1 } },
      { new: true, upsert: true }
    );

    // Start from 10000
    const accountNumber = 10000 + counter.sequence_value;
    return `${accountNumber}`; 
  } catch (error) {
    throw new Error("Failed to generate portfolio account number");
  }
};

module.exports = { generatePortfolioAccountNumber };
