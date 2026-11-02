const Portfolio = require("../../models/Portfolio");
const User = require("../../models/User");
const { sendSuccess, sendError } = require("../../utils/response");
const supportContactService = require("../../services/supportContactService");
const AuditService = require("../../services/auditService");
const profileService = require("../../services/profileService");
const Building = require("../../models/Building");
const { notifyOwnerLinkedPortfolio } = require("../../services/portfolioNotificationService");

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

const REPAIR_OPTION_LABELS = {
  diy_landlord: "Owner handles repairs (DIY)",
  preferred_vendor_list: "Owner's preferred vendors",
  renters_choice_vendors: "Renter's Choice vendors",
};


const OWNER_PORTFOLIO_SELECT =
  "portfolioName portfolioAccountNumber formData.managementStartDate formData.repairsMaintenance createdBy";
const OWNER_PORTFOLIO_POPULATE = {
  path: "createdBy",
  select: "team",
  populate: { path: "team", select: "businessLegalName" },
};

/** Portfolio docs → owner-safe DTOs (building counts in ONE query) */
async function toOwnerPortfolioDTOs(portfolios) {
  if (!portfolios.length) return [];

  const counts = await Building.aggregate([
    {
      $match: {
        portfolio: { $in: portfolios.map((p) => p._id) },
        parentBuilding: null,
      },
    },
    { $group: { _id: "$portfolio", count: { $sum: 1 } } },
  ]);
  const countById = new Map(counts.map((c) => [String(c._id), c.count]));

  return portfolios.map((p) => {
    const repairs = p.formData?.repairsMaintenance || {};
    return {
      _id: p._id,
      portfolioName: p.portfolioName,
      portfolioAccountNumber: p.portfolioAccountNumber,
      buildingCount: countById.get(String(p._id)) || 0,
      managedBy: p.createdBy?.team?.businessLegalName || "Renter's Choice",
      managementStartDate: p.formData?.managementStartDate || null,
      repairOption: REPAIR_OPTION_LABELS[repairs.option] || "",
      spendingLimit: repairs.spendingLimit || "",
    };
  });
}

// GET /my-portfolios — portfolios the logged-in owner is attached to
exports.getMyPortfolios = async (req, res) => {
  try {
    const portfolios = await Portfolio.find({
      owners: req.user._id,
      status: { $ne: "Deactivated" },
    })
      .select(OWNER_PORTFOLIO_SELECT)
      .populate(OWNER_PORTFOLIO_POPULATE)
      .sort({ portfolioName: 1 })
      .lean();

    return sendSuccess(res, "Portfolios fetched successfully", {
      portfolios: await toOwnerPortfolioDTOs(portfolios),
    });
  } catch (err) {
    return sendError(res, err.message || "Failed to fetch portfolios", 500);
  }
};

const PORTFOLIO_NUMBER_RE = /^\d{5,6}$/; // same rule as generateAccountNumber
const NOT_FOUND_MSG =
  "We couldn't find an active portfolio with that number. Please check and try again.";

// POST /my-portfolios — owner links themselves to a portfolio by its number
exports.addMyPortfolio = async (req, res) => {
  try {
    const portfolioNumber = String(req.body?.portfolioNumber ?? "").trim();
    if (!PORTFOLIO_NUMBER_RE.test(portfolioNumber)) {
      return sendError(res, "Portfolio number must be 5–6 digits", 400);
    }

    const userId = req.user._id;

    // Same message for "not found" and "deactivated" → no information leak
    const portfolio = await Portfolio.findOne({
      portfolioAccountNumber: portfolioNumber,
      status: "Active",
    })
      .select("_id portfolioName portfolioAbbreviation owners createdBy")
      .lean();
    if (!portfolio) return sendError(res, NOT_FOUND_MSG, 404);

    if (portfolio.owners?.some((o) => String(o) === String(userId))) {
      return sendError(
        res,
        "This portfolio is already linked to your account.",
        409,
      );
    }

    // Atomic: only adds if still Active and not already an owner
    const result = await Portfolio.updateOne(
      { _id: portfolio._id, status: "Active", owners: { $ne: userId } },
      { $addToSet: { owners: userId } },
    );
    if (result.modifiedCount === 0) {
      return sendError(
        res,
        "This portfolio could not be linked. Please refresh and try again.",
        409,
      );
    }

    // Audit — never fail the request because of logging
    AuditService.logActivity({
      entityType: "portfolio",
      entityId: portfolio._id,
      action: "updated",
      actionDetails: `Owner ${req.user.email} linked to portfolio ${portfolio.portfolioAbbreviation} using the portfolio number`,
      changes: [
        { field: "owners", oldValue: null, newValue: [String(userId)] },
      ],
      performedBy: userId,
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }).catch((e) => console.error("Add portfolio audit failed:", e));

    // Notify the office that manages this portfolio — never blocks the response
    notifyOwnerLinkedPortfolio({ portfolio, owner: req.user }).catch((e) =>
      console.error("Owner-linked notification failed:", e),
    );

    // Return the same DTO as GET /my-portfolios
    const linked = await Portfolio.findById(portfolio._id)
      .select(OWNER_PORTFOLIO_SELECT)
      .populate(OWNER_PORTFOLIO_POPULATE)
      .lean();
    const [dto] = await toOwnerPortfolioDTOs([linked]);

    return sendSuccess(
      res,
      `"${portfolio.portfolioName}" has been added to your account.`,
      { portfolio: dto },
      201,
    );
  } catch (err) {
    return sendError(res, "Failed to add portfolio", 500);
  }
};

// Renter's Choice support details (profile → "Contact Renter's Choice")
exports.getSupportContact = async (req, res) => {
  try {
    const contact = await supportContactService.getSupportContact();
    return sendSuccess(res, "Support contact fetched", contact);
  } catch (err) {
    return sendError(res, "Failed to fetch support contact", 500);
  }
};

// GET /api/externalUsers/me/profile — logged-in user's own profile
exports.getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select(profileService.PROFILE_SELECT)
      .lean();
    if (!user) return sendError(res, "User not found", 404);

    return sendSuccess(res, "Profile fetched", {
      profile: profileService.toProfileDTO(user),
    });
  } catch (err) {
    return sendError(res, "Failed to fetch profile", 500);
  }
};

// PATCH /api/externalUsers/me/profile — update own editable fields only
exports.updateMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select(profileService.PROFILE_SELECT)
      .lean();
    if (!user) return sendError(res, "User not found", 404);

    const { set, errors } = profileService.validateProfileUpdate(
      req.body,
      user,
    );
    if (errors.length) return sendError(res, errors.join(", "), 400);
    if (!Object.keys(set).length)
      return sendError(res, "Nothing to update", 400);

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $set: set },
      { new: true, runValidators: true },
    )
      .select(profileService.PROFILE_SELECT)
      .lean();

    const before = profileService.toProfileDTO(user);
    const after = profileService.toProfileDTO(updated);

    // Audit — never fail the save because of logging
    const changes = [
      "preferredName",
      "technicianName",
      "fullName",
      "alternateEmail",
    ]
      .filter((f) => before[f] !== after[f])
      .map((f) => ({ field: f, oldValue: before[f], newValue: after[f] }));

    if (changes.length) {
      AuditService.logActivity({
        entityType: "user",
        entityId: req.user._id,
        action: "updated",
        actionDetails: "Profile updated by user",
        changes,
        performedBy: req.user._id,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      }).catch((e) => console.error("Profile audit failed:", e));
    }

    return sendSuccess(res, "Profile updated successfully", {
      profile: after,
    });
  } catch (err) {
    if (err?.name === "ValidationError")
      return sendError(res, err.message, 400);
    return sendError(res, "Failed to update profile", 500);
  }
};
