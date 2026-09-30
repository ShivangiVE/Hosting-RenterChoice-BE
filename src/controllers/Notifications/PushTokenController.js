const PushToken = require("../../models/PushToken");
const { sendSuccess } = require("../../utils/response");

const VALID_PLATFORMS = ["web", "android", "ios"];

exports.registerPushToken = async (req, res) => {
  try {
    if (req.isImpersonated) {
      return res.status(403).json({
        success: false,
        code: "IMPERSONATION_NOT_ALLOWED",
        message:
          "Push notifications can't be enabled while impersonating a user.",
      });
    }

    const { token, platform, deviceInfo } = req.body;

    if (!token || !platform) {
      return res.status(400).json({
        success: false,
        message: "token and platform are required",
      });
    }

    if (!VALID_PLATFORMS.includes(platform)) {
      return res.status(400).json({
        success: false,
        message: `platform must be one of: ${VALID_PLATFORMS.join(", ")}`,
      });
    }

    const saved = await PushToken.findOneAndUpdate(
      { token },
      {
        $set: {
          user: req.user._id,
          platform,
          deviceInfo: deviceInfo || "",
          lastUsedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return sendSuccess(res, "Push token registered", {
      _id: saved._id,
      platform: saved.platform,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// POST /api/push-tokens/unregister
// Called on logout, BEFORE the auth token is cleared on the client, so a
// signed-out device stops receiving pushes meant for that account.
exports.unregisterPushToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "token is required",
      });
    }

    // Scoped to the current user so nobody can unregister someone else's
    // device just by knowing its token.
    await PushToken.deleteOne({ token, user: req.user._id });

    return sendSuccess(res, "Push token unregistered");
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
