const Portfolio = require("../../models/Portfolio");
const User = require("../../models/User");
const { sendSuccess, sendError } = require("../../utils/response");

// Get all vendors
exports.getVendors = async (req, res) => {
  try {
    const vendors = await User.find({ role: "Vendor" }).select(
      "_id companyName technicianName email",
    );

    return sendSuccess(res, "Vendors fetched successfully", { vendors });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch vendors", 500);
  }
};

// Get all owners
exports.getOwners = async (req, res) => {
  try {
    const { search } = req.query;
    const query = { role: "Owner" };

    // If search provided, match against firstName, lastName, or email
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
      ];
    }

    const owners = await User.find(query).select(
      "_id preferredName firstName lastName email attachedTo",
    );

    return sendSuccess(res, "Owners fetched successfully", { owners });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch owners", 500);
  }
};

// Get portfolios the logged-in owner is attached to (Owner profile page)
exports.getMyPortfolios = async (req, res) => {
  try {
    const portfolios = await Portfolio.find({
      owners: req.user._id,
      status: { $ne: "Deactivated" },
    })
      .select(
        "portfolioName portfolioAbbreviation portfolioAccountNumber status",
      )
      .sort({ portfolioName: 1 })
      .lean();

    return sendSuccess(res, "Portfolios fetched successfully", { portfolios });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch portfolios", 500);
  }
};
