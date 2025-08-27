const User = require("../../models/User");
const { sendSuccess, sendError } = require("../../utils/response");

// Get all inspection clerks
exports.getInspectionClerks = async (req, res) => {
  try {
    const clerks = await User.find({ role: "InspectionClerk" }).select(
      "_id preferredName email"
    );

    return sendSuccess(res, "Inspection clerks fetched successfully", {
      clerks,
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch inspection clerks",
      500
    );
  }
};
