const Bank = require("../../models/Accounts/Bank");


exports.getBanks = async (req, res) => {
  try {
    const banks = await Bank.find({ isActive: true })
      .sort({ name: 1 })
      .select(
        "institutionNumber name accountNumberMin accountNumberMax typicalLengthNote",
      );
    return res.status(200).json({ success: true, data: banks });
  } catch (error) {
    console.error("getBanks error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch banks" });
  }
};
