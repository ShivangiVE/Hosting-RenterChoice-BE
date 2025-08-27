const User = require("../../models/User");
const { sendSuccess, sendError } = require("../../utils/response");



// Get all vendors
exports.getVendors = async (req, res) => {
  try {
    const vendors = await User.find({ role: "Vendor" }).select(
      "_id companyName technicianName email"
    );

    return sendSuccess(res, "Vendors fetched successfully", { vendors });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch vendors", 500);
  }
};
