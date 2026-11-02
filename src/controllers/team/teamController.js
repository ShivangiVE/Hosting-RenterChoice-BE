const mongoose = require("mongoose");
const Team = require("../../models/Team");
const User = require("../../models/User");
const { sendError, sendSuccess } = require("../../utils/response");
const {
  createInviteToken,
  createUnusablePassword,
} = require("../../utils/inviteToken");
const { sendTeamAdminInviteEmail } = require("../../services/emailService");
const { TEAM_ROLES } = require("../../constants/roles");
const { generateTeamUniqueId } = require("../../utils/generateTeamUniqueId");
const { validateBankDetails } = require("../../utils/bankDetails");

// ── Rules ──────────────────────────────────────────────────────────────────
// Franchise = Brokerage, Expansion = Team/Office (client, Oct 26 call).
const TEAM_TYPE_CONFIG = {
  franchise: { adminRole: "BrokerageAdmin", label: "Brokerage" },
  expansion: { adminRole: "OfficeAdmin", label: "Team" },
};
const NOT_READY_TEAM_TYPES = ["subscribe"];

// Form time-zone codes → IANA zone stored on the admin user
// (client is Canada-based: Calgary/Lethbridge = Mountain time)
const TIME_ZONE_TO_IANA = {
  PDT: "America/Vancouver",
  MST: "America/Edmonton",
  CST: "America/Winnipeg",
  EDT: "America/Toronto",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+()\-\s\d]{7,20}$/;
const POSTAL = /^[A-Za-z0-9\s-]{3,10}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const str = (v, max = 200) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const isValidIsoDate = (v) => ISO_DATE.test(v) && !Number.isNaN(Date.parse(v));

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function parseYearEndAudit(input) {
  if (input == null || input === "") return { value: null };
  const month = Number(input.month);
  const day = Number(input.day);
  if (!input.month && !input.day) return { value: null };
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { error: "Year-End Audit month is invalid" };
  }
  if (!Number.isInteger(day) || day < 1 || day > DAYS_IN_MONTH[month - 1]) {
    return { error: "Year-End Audit day is invalid for the selected month" };
  }
  return { value: { month, day } };
}

const frontendUrl = () =>
  (process.env.FRONTEND_URL || process.env.CLIENT_URL || "").replace(
    /\/+$/,
    "",
  );

const buildInviteLink = (token) =>
  `${frontendUrl()}/accept-invite?token=${encodeURIComponent(token)}`;

// Never let an email failure turn a committed create into an error
async function trySendInvite({ user, team, token }) {
  try {
    await sendTeamAdminInviteEmail({
      to: user.email,
      name: user.preferredName,
      teamName: team.businessLegalName,
      roleLabel:
        team.teamType === "franchise" ? "Brokerage Admin" : "Team Admin",
      link: buildInviteLink(token),
    });
    return true;
  } catch (err) {
    console.error("Team admin invite email failed:", err);
    return false;
  }
}

// ── Who may create what ───────────────────────────────────────────────────
// Master Admin   → Franchise (brokerage) or Expansion under any brokerage.
// BrokerageAdmin → Expansion ONLY, always under their own brokerage.
//                  teamType / parentBrokerage from the client are ignored.
const findActiveBrokerageOf = (user) =>
  user?.team
    ? Team.findOne({ _id: user.team, teamType: "franchise", status: "Active" })
        .select("businessLegalName companyCity admin")
        .lean()
    : null;

const NOT_LINKED_MESSAGE =
  "Your account is not linked to an active brokerage. Please contact the Master Admin.";

async function resolveCreateScope(user, body) {
  if (user.role === "Admin") return { body };

  if (user.role === "BrokerageAdmin") {
    const brokerage = await findActiveBrokerageOf(user);
    if (!brokerage) return { error: NOT_LINKED_MESSAGE, status: 403 };
    return {
      body: { ...body, teamType: "expansion", parentBrokerage: brokerage._id },
    };
  }

  return { error: "Not allowed to create teams", status: 403 };
}

function validateCreatePayload(body) {
  const errors = [];
  const teamType = str(body.teamType, 20).toLowerCase();

  if (NOT_READY_TEAM_TYPES.includes(teamType)) {
    errors.push("Subscribe teams are not available yet");
    return { errors };
  }
  if (!TEAM_TYPE_CONFIG[teamType]) {
    errors.push("Team Type must be Franchise or Expansion");
    return { errors };
  }

  const data = {
    teamType,
    parentBrokerage: teamType === "expansion" ? body.parentBrokerage : null,
    businessLegalName: str(body.businessLegalName, 150),

    companyPhone: str(body.companyPhone, 20),
    alternatePhone: str(body.alternatePhone, 20),
    companyAddress: str(body.companyAddress, 250),
    companyCity: str(body.companyCity, 120),
    postalCode: str(body.postalCode, 10),
    gstDetails: str(body.gstDetails, 50),
    timeZone: str(body.timeZone, 5).toUpperCase() || "MST",
    packageType: str(body.packageType, 50),
    anniversaryDate: str(body.anniversaryDate, 10),
  };

  // Franchise only — ignored for expansions
  const yearEndAudit =
    teamType === "franchise"
      ? parseYearEndAudit(body.yearEndAudit)
      : { value: null };
  data.yearEndAudit = yearEndAudit.value;

  const admin = {
    name: str(body.admin?.name, 120),
    email: str(body.admin?.email, 254).toLowerCase(),
    signatureLine: str(body.admin?.signatureLine, 500),
  };

  if (!data.businessLegalName) errors.push("Business Legal Name is required");
  if (
    teamType === "expansion" &&
    !mongoose.isValidObjectId(data.parentBrokerage)
  )
    errors.push("Please select the brokerage this team belongs to");
  if (!data.companyPhone) errors.push("Company Phone Number is required");
  else if (!PHONE.test(data.companyPhone))
    errors.push("Company Phone Number is invalid");
  if (!data.gstDetails) errors.push("GST Details are required");
  if (data.alternatePhone && !PHONE.test(data.alternatePhone))
    errors.push("Alternate Phone Number is invalid");
  if (data.postalCode && !POSTAL.test(data.postalCode))
    errors.push("Postal Code is invalid");
  if (!TIME_ZONE_TO_IANA[data.timeZone]) errors.push("Time Zone is invalid");
  if (data.anniversaryDate && !isValidIsoDate(data.anniversaryDate))
    errors.push("Anniversary Date is invalid");
  if (yearEndAudit.error) errors.push(yearEndAudit.error);

  if (!admin.name) errors.push("Admin User Name is required");
  if (!EMAIL.test(admin.email)) errors.push("Admin email address is invalid");
  if (!admin.signatureLine) errors.push("Admin Signature Line is required");

  return { errors, data, admin };
}

// POST /api/teams  (Master Admin)
// Creates the Brokerage/Team AND its admin user in one transaction, then
// emails the admin a one-time link to set their own password.
exports.createTeam = async (req, res) => {
  const scope = await resolveCreateScope(req.user, req.body || {});
  if (scope.error) return sendError(res, scope.error, scope.status);

  const { errors, data, admin } = validateCreatePayload(scope.body);

  // Banking is optional, but all-or-nothing once any bank field is filled
  const banking = await validateBankDetails(scope.body.banking, {
    optional: true,
  });
  errors.push(...banking.errors);
  if (errors.length) return sendError(res, errors.join(", "), 400);

  if (await User.exists({ email: admin.email })) {
    return sendError(res, "A user with this email already exists", 409);
  }

  const { adminRole } = TEAM_TYPE_CONFIG[data.teamType];
  const invite = createInviteToken();
  const session = await mongoose.startSession();

  let team;
  let user;
  try {
    await session.withTransaction(async () => {
      // Unique ID is allocated inside the transaction: it is only "used"
      // if the team + admin are really saved (rolled back otherwise).
      const uniqueIdNumber = await generateTeamUniqueId({ session });

      // Built inside the callback so a transient-error retry starts clean
      team = new Team({
        ...data,
        uniqueIdNumber,
        banking: banking.value
          ? { ...banking.value, updatedAt: new Date(), updatedBy: req.user._id }
          : null,
        anniversaryDate: data.anniversaryDate || null,
       
        createdBy: req.user._id,
      });
      user = new User({
        preferredName: admin.name,
        fullName: admin.name,
        email: admin.email,
        password: createUnusablePassword(),
        role: adminRole,
        team: team._id,
        emailSignature: admin.signatureLine,
        timeZone: TIME_ZONE_TO_IANA[data.timeZone],
        createdBy: req.user._id,
        inviteTokenHash: invite.tokenHash,
        inviteExpires: invite.expiresAt,
      });
      team.admin = user._id;

      // A Team Admin is managed by their brokerage's admin, so they show up
      // in the Brokerage Admin's existing lists (same as createOfficeAdmin).
      if (data.teamType === "expansion") {
        const parent = await Team.findById(data.parentBrokerage)
          .select("admin")
          .session(session)
          .lean();
        if (parent?.admin) user.managedBy = parent.admin;
      }

      await team.save({ session });
      await user.save({ session });
    });
  } catch (err) {
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0];
      const message =
        field === "email"
          ? "A user with this email already exists"
          : field === "uniqueIdNumber"
            ? "Could not assign a Unique ID Number. Please try again."
            : "Duplicate value";
      return sendError(res, message, 409);
    }
    if (err?.code === "TEAM_ID_EXHAUSTED") {
      console.error("createTeam failed:", err);
      return sendError(res, err.message, 500);
    }

    if (err?.name === "ValidationError" || /brokerage/i.test(err?.message)) {
      return sendError(res, err.message, 400);
    }
    console.error("createTeam failed:", err);
    return sendError(res, "Failed to create team", 500);
  } finally {
    await session.endSession();
  }

  const inviteEmailSent = await trySendInvite({
    user,
    team,
    token: invite.token,
  });

  return sendSuccess(
    res,
    inviteEmailSent
      ? `${TEAM_TYPE_CONFIG[team.teamType].label} created. An invitation email was sent to ${user.email}.`
      : `${TEAM_TYPE_CONFIG[team.teamType].label} created, but the invitation email could not be sent. Use "Resend invite".`,
    {
      team: {
        _id: team._id,
        teamType: team.teamType,
        businessLegalName: team.businessLegalName,
        uniqueIdNumber: team.uniqueIdNumber,
        parentBrokerage: team.parentBrokerage,
      },
      admin: { _id: user._id, email: user.email, role: user.role },
      inviteEmailSent,
    },
  );
};

exports.getBrokerages = async (req, res) => {
  try {
    const brokerages = await Team.find({
      teamType: "franchise",
      status: "Active",
    })
      .select("businessLegalName uniqueIdNumber companyCity")
      .sort({ businessLegalName: 1 })
      .lean();
    return sendSuccess(res, "Brokerages fetched", { brokerages });
  } catch (err) {
    return sendError(res, "Failed to fetch brokerages", 500);
  }
};

exports.resendTeamAdminInvite = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id))
    return sendError(res, "Invalid team id", 400);

  try {
    const team = await Team.findById(id).select(
      "teamType businessLegalName admin parentBrokerage",
    );
    if (!team) return sendError(res, "Team not found", 404);

    if (req.user.role === "BrokerageAdmin") {
      const ownsTeam =
        req.user.team &&
        team.parentBrokerage &&
        String(team.parentBrokerage) === String(req.user.team);
      // 404 (not 403) so other brokerages' team ids aren't confirmed
      if (!ownsTeam) return sendError(res, "Team not found", 404);
    }

    const user = await User.findById(team.admin);
    if (!user) return sendError(res, "Team admin not found", 404);
    if (user.inviteAcceptedAt) {
      return sendError(res, "This admin has already set their password", 400);
    }

    const invite = createInviteToken();
    user.inviteTokenHash = invite.tokenHash;
    user.inviteExpires = invite.expiresAt;
    await user.save();

    const sent = await trySendInvite({ user, team, token: invite.token });
    if (!sent)
      return sendError(res, "Could not send the invitation email", 502);
    return sendSuccess(res, `Invitation re-sent to ${user.email}`);
  } catch (err) {
    return sendError(res, "Failed to resend invitation", 500);
  }
};

exports.getMyBrokerage = async (req, res) => {
  try {
    const brokerage = await findActiveBrokerageOf(req.user);
    if (!brokerage) return sendError(res, NOT_LINKED_MESSAGE, 404);
    return sendSuccess(res, "Brokerage fetched", {
      brokerage: {
        _id: brokerage._id,
        businessLegalName: brokerage.businessLegalName,
        companyCity: brokerage.companyCity || "",
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch brokerage", 500);
  }
};

// ── Office Locations (Master Admin) ───────────────────────────────────────
const OFFICE_MEMBER_ROLES = [
  ...new Set([...TEAM_ROLES, "InternalTeam", "InspectionClerk"]),
];

async function loadBrokerageStructure(brokerageId) {
  const brokerage = await Team.findOne({
    _id: brokerageId,
    teamType: "franchise",
  })
    .select("businessLegalName companyCity status admin")
    .populate("admin", "preferredName email isActive role")
    .lean();
  if (!brokerage) return null;

  const expansions = await Team.find({
    teamType: "expansion",
    parentBrokerage: brokerage._id,
  })
    .select("businessLegalName companyCity status admin createdAt")
    .populate("admin", "preferredName email isActive role")
    .sort({ businessLegalName: 1 })
    .lean();

  const teamIds = expansions.map((t) => t._id);
  const adminIds = expansions.map((t) => t.admin?._id).filter(Boolean);

  const members = await User.find({
    role: { $in: OFFICE_MEMBER_ROLES },
    $or: [
      { team: { $in: teamIds } },
      {
        createdBy: { $in: adminIds },
        $or: [{ team: null }, { team: { $exists: false } }],
      },
    ],
  })
  .select("preferredName email role isActive isLPM createdBy")
    .sort({ preferredName: 1 })
    .lean();

  const teamIdByAdmin = new Map(
    expansions
      .filter((t) => t.admin?._id)
      .map((t) => [String(t.admin._id), String(t._id)]),
  );
  const membersByTeam = new Map(teamIds.map((tid) => [String(tid), []]));
  members.forEach((m) => {
    const key = m.team
      ? String(m.team)
      : teamIdByAdmin.get(String(m.createdBy));
    if (key && membersByTeam.has(key)) membersByTeam.get(key).push(m);
  });

  return {
    brokerage,
    expansions: expansions.map((t) => ({
      ...t,
      members: membersByTeam.get(String(t._id)) || [],
    })),
  };
}

exports.getBrokerageStructure = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return sendError(res, "Invalid brokerage id", 400);
  }

  try {
    const structure = await loadBrokerageStructure(id);
    if (!structure) return sendError(res, "Brokerage not found", 404);
    return sendSuccess(res, "Brokerage structure fetched", structure);
  } catch (err) {
    console.error("getBrokerageStructure failed:", err);
    return sendError(res, "Failed to load brokerage teams", 500);
  }
};

exports.getMyBrokerageStructure = async (req, res) => {
  try {
    const brokerage = await findActiveBrokerageOf(req.user);
    if (!brokerage) return sendError(res, NOT_LINKED_MESSAGE, 404);

    const structure = await loadBrokerageStructure(brokerage._id);
    if (!structure) return sendError(res, NOT_LINKED_MESSAGE, 404);
    return sendSuccess(res, "Brokerage structure fetched", structure);
  } catch (err) {
    console.error("getMyBrokerageStructure failed:", err);
    return sendError(res, "Failed to load your teams", 500);
  }
};
