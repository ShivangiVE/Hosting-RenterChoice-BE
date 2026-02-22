const User = require("../../models/User");
const { sendSuccess, sendError } = require("../../utils/response");

exports.updateRepairPreference = async (req, res) => {
  try {
    const { defaultRepairTab } = req.body;

    if (!["Work Order", "Tasks"].includes(defaultRepairTab)) {
      return sendError(res, "Invalid tab", 400);
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { defaultRepairTab },
      { new: true },
    );

    return sendSuccess(res, "Preference updated", {
      defaultRepairTab: user.defaultRepairTab,
    });
  } catch (err) {
    return sendError(res, err.message);
  }
};
