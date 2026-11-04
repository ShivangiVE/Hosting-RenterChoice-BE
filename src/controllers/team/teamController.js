const mongoose = require("mongoose");
const Team = require("../../models/Team");
const User = require("../../models/User");
const { sendError, sendSuccess } = require("../../utils/response");
const {
  createInviteToken,
  createUnusablePassword,
} = require("../../utils/inviteToken");
const { sendTeamAdminInviteEmail } = require("../../services/emailService");
const { TEAM_ROLES, BROKERAGE_STAFF_ROLES } = require("../../constants/roles");
const { generateTeamUniqueId } = require("../../utils/generateTeamUniqueId");
const { validateBankDetails } = require("../../utils/bankDetails");

// ── Rules ──────────────────────────────────────────────────────────────────
// Franchise = Brokerage, Expansion = Team/Office (client, Oct 26 call).
const TEAM_TYPE_CONFIG = {
  franchise: { adminRole: "BrokerageAdmin", label: "Brokerage" },
  expansion: { adminRole: "OfficeAdmin", label: "Team" },
};
const NOT_READY_TEAM_TYPES = ["subscribe"];

// Form time-zone codes → IANA zone stored on the admin user.
// BC, Alberta and Manitoba are on permanent daylight time since Nov 1, 2026;
// the IANA zones stay the same (the tz database carries the new rules).
const TIME_ZONE_TO_IANA = {
  PCT: "America/Vancouver", // British Columbia
  ABT: "America/Edmonton", // Alberta
  MBT: "America/Winnipeg", // Manitoba
  ET: "America/Toronto", // Ontario – Eastern (EST/EDT)
  CT: "America/Winnipeg", // Ontario – Northwestern (tz data follows Manitoba)
};
const DEFAULT_TIME_ZONE = "ABT";

// Old codes still in some records → new codes
const LEGACY_TIME_ZONE_MAP = { PDT: "PCT", MST: "ABT", CST: "MBT", EDT: "ET" };

const normalizeTimeZone = (code) => {
  const upper = String(code || "").toUpperCase();
  return LEGACY_TIME_ZONE_MAP[upper] || upper;
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

// Directors: accepts an array or a comma-separated string → clean, unique list
const MAX_DIRECTORS = 20;
function parseDirectors(input) {
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : [];
  const seen = new Set();
  return raw
    .map((name) => str(name, 120))
    .filter((name) => {
      const key = name.toLowerCase();
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_DIRECTORS);
}

// ── Business + subscription fields
// Only these fields are read from the client. Anything else in the body
// (uniqueIdNumber, status, admin, createdBy, …) is ignored.
function parseBusinessInfo(body, teamType) {
  const errors = [];
  const data = {
    businessLegalName: str(body.businessLegalName, 150),
    registeredTradeName: str(body.registeredTradeName, 150),
    registeredDirectors: parseDirectors(body.registeredDirectors),
    companyPhone: str(body.companyPhone, 20),
    alternatePhone: str(body.alternatePhone, 20),
    companyAddress: str(body.companyAddress, 250),
    companyCity: str(body.companyCity, 120),
    postalCode: str(body.postalCode, 10),
    gstDetails: str(body.gstDetails, 50),
    timeZone: normalizeTimeZone(str(body.timeZone, 5)) || DEFAULT_TIME_ZONE,
    packageType: str(body.packageType, 50),
    anniversaryDate: str(body.anniversaryDate, 10),
  };

  // Franchise only — ignored for expansions
  const yearEndAudit =
    teamType === "franchise"
      ? parseYearEndAudit(body.yearEndAudit)
      : { value: null };
  data.yearEndAudit = yearEndAudit.value;

  if (!data.businessLegalName) errors.push("Business Legal Name is required");
  // Registered Trade Name and Registered Directors are optional
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

  return { errors, data };
}

function validateCreatePayload(body) {
  const teamType = str(body.teamType, 20).toLowerCase();

  if (NOT_READY_TEAM_TYPES.includes(teamType)) {
    return { errors: ["Subscribe teams are not available yet"] };
  }
  if (!TEAM_TYPE_CONFIG[teamType]) {
    return { errors: ["Team Type must be Franchise or Expansion"] };
  }

  const { errors, data: info } = parseBusinessInfo(body, teamType);
  const data = {
    teamType,
    parentBrokerage: teamType === "expansion" ? body.parentBrokerage : null,
    ...info,
  };

  const admin = {
    name: str(body.admin?.name, 120),
    email: str(body.admin?.email, 254).toLowerCase(),
    signatureLine: str(body.admin?.signatureLine, 500),
  };

  if (
    teamType === "expansion" &&
    !mongoose.isValidObjectId(data.parentBrokerage)
  )
    errors.push("Please select the brokerage this team belongs to");

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

// Brokerage-level staff (BrokerageAccounts / BrokerageUser) — they belong to
// the brokerage itself, not to one of its teams. Matched by `team`, with a
// fallback for older accounts that only have createdBy = the Brokerage Admin.
function loadBrokerageStaff(brokerage) {
  const scopes = [{ team: brokerage._id }];
  if (brokerage.admin?._id) {
    scopes.push({
      createdBy: brokerage.admin._id,
      $or: [{ team: null }, { team: { $exists: false } }],
    });
  }
  return User.find({ role: { $in: BROKERAGE_STAFF_ROLES }, $or: scopes })
    .select("preferredName email role isActive createdAt")
    .sort({ preferredName: 1 })
    .lean();
}

async function loadBrokerageStructure(brokerageId) {
  const brokerage = await Team.findOne({
    _id: brokerageId,
    teamType: "franchise",
  })
    .select("businessLegalName companyCity status admin")
    .populate("admin", "preferredName email isActive role")
    .lean();
  if (!brokerage) return null;

  const [expansions, staff] = await Promise.all([
    Team.find({
      teamType: "expansion",
      parentBrokerage: brokerage._id,
    })
      .select("businessLegalName companyCity status admin createdAt")
      .populate("admin", "preferredName email isActive role")
      .sort({ businessLegalName: 1 })
      .lean(),
    loadBrokerageStaff(brokerage),
  ]);

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
    staff,
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

// ── Edit Brokerage / Team ─────────────────────────────────────────────────
// Master Admin   → any brokerage or team.
// BrokerageAdmin → only the teams under their own (active) brokerage.
// Locked after create: teamType, parentBrokerage, uniqueIdNumber and the
// admin user (changing those affects roles/hierarchy — separate flows).
const EDIT_NOT_FOUND = "Brokerage or team not found";

// Explicit banking sub-paths: the encrypted account number is never read here
const EDIT_SELECT = [
  "teamType",
  "parentBrokerage",
  "businessLegalName",
  "uniqueIdNumber",
  "registeredTradeName",
  "registeredDirectors",
  "companyPhone",
  "alternatePhone",
  "companyAddress",
  "companyCity",
  "postalCode",
  "gstDetails",
  "timeZone",
  "packageType",
  "anniversaryDate",
  "yearEndAudit",
  "banking.bankId",
  "banking.bankName",
  "banking.institutionNumber",
  "banking.transit",
  "banking.accountNumberLast4",
  "banking.billingFirstName",
  "banking.billingLastName",
  "banking.billingAddress",
  "banking.billingEmail",
  "admin",
  "status",
  "updatedAt",
].join(" ");

// Returns the Mongo filter this user may edit, or null.
// Out-of-scope ids get the same 404 as missing ones (no information leak).
async function editScopeFilter(user, id) {
  if (!mongoose.isValidObjectId(id)) return null;
  if (user.role === "Admin") return { _id: id };

  if (user.role === "BrokerageAdmin") {
    const brokerage = await findActiveBrokerageOf(user);
    if (!brokerage) return null;
    return { _id: id, teamType: "expansion", parentBrokerage: brokerage._id };
  }
  return null;
}

const isoDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

// Whitelisted shape sent to the edit form — never spread the raw document
function toEditDTO(team) {
  const b = team.banking;
  const parent = team.parentBrokerage;
  const admin = team.admin;
  return {
    _id: team._id,
    teamType: team.teamType,
    label: TEAM_TYPE_CONFIG[team.teamType]?.label || "Team",
    parentBrokerage: parent?._id
      ? { _id: parent._id, businessLegalName: parent.businessLegalName }
      : null,
    businessLegalName: team.businessLegalName || "",
    uniqueIdNumber: team.uniqueIdNumber || "",
    registeredTradeName: team.registeredTradeName || "",
    registeredDirectors: team.registeredDirectors || [],
    companyPhone: team.companyPhone || "",
    alternatePhone: team.alternatePhone || "",
    companyAddress: team.companyAddress || "",
    companyCity: team.companyCity || "",
    postalCode: team.postalCode || "",
    gstDetails: team.gstDetails || "",
    timeZone: normalizeTimeZone(team.timeZone) || DEFAULT_TIME_ZONE,
    packageType: team.packageType || "",
    anniversaryDate: isoDay(team.anniversaryDate),
    yearEndAudit: team.yearEndAudit
      ? { month: team.yearEndAudit.month, day: team.yearEndAudit.day }
      : null,
    banking: b?.bankId
      ? {
          bankId: b.bankId,
          bankName: b.bankName || "",
          institutionNumber: b.institutionNumber || "",
          transit: b.transit || "",
          accountNumberLast4: b.accountNumberLast4 || "",
          billingFirstName: b.billingFirstName || "",
          billingLastName: b.billingLastName || "",
          billingAddress: b.billingAddress || "",
          billingEmail: b.billingEmail || "",
        }
      : null,
    admin: admin?._id
      ? {
          _id: admin._id,
          preferredName: admin.preferredName || "",
          email: admin.email || "",
          emailSignature: admin.emailSignature || "",
          inviteAccepted: Boolean(admin.inviteAcceptedAt),
        }
      : null,
    status: team.status,
    updatedAt: team.updatedAt,
  };
}

async function loadTeamForEdit(filter) {
  const team = await Team.findOne(filter)
    .select(EDIT_SELECT)
    .populate("parentBrokerage", "businessLegalName")
    .populate("admin", "preferredName email emailSignature inviteAcceptedAt")
    .lean();
  return team ? toEditDTO(team) : null;
}

// Banking on edit:
//   null                         → every bank field was cleared → remove banking
//   new account number entered   → full validation, replace (same as create)
//   bank changed, no account     → error (account rules depend on the bank)
//   same bank, no account number → keep the stored encrypted account,
//                                  update transit + billing only
async function resolveBankingUpdate(input, team) {
  if (input == null) return { mode: "clear", errors: [] };

  const stored = team.banking;
  const sameBank =
    stored?.bankId && String(stored.bankId) === String(input.bankId || "");
  const newAccount = str(input.accountNumber, 30);

  if (newAccount || !sameBank) {
    const result = await validateBankDetails(input, { optional: true });
    return { mode: "replace", errors: result.errors, value: result.value };
  }

  const errors = [];
  const value = {
    transit: str(input.transit, 5),
    billingFirstName: str(input.billingFirstName, 80),
    billingLastName: str(input.billingLastName, 80),
    billingAddress: str(input.billingAddress, 250),
    billingEmail: str(input.billingEmail, 254).toLowerCase(),
  };
  if (!/^\d{5}$/.test(value.transit))
    errors.push("Transit number must be exactly 5 digits");
  if (!value.billingFirstName) errors.push("Billing first name is required");
  if (!value.billingLastName) errors.push("Billing last name is required");
  if (value.billingEmail && !EMAIL.test(value.billingEmail))
    errors.push("Billing email is invalid");
  return { mode: "keep-account", errors, value };
}

function applyBankingUpdate(team, banking, userId) {
  if (banking.mode === "clear") {
    if (team.banking) team.banking = null;
    return;
  }
  if (banking.mode === "replace") {
    team.banking = {
      ...banking.value,
      updatedAt: new Date(),
      updatedBy: userId,
    };
    return;
  }
  // keep-account: set only these paths, so the encrypted account is untouched
  Object.entries(banking.value).forEach(([key, val]) =>
    team.set(`banking.${key}`, val),
  );
  if (team.isModified("banking")) {
    team.set("banking.updatedAt", new Date());
    team.set("banking.updatedBy", userId);
  }
}

// GET /api/teams/:id  (Master Admin, Brokerage Admin) — prefill the edit form
exports.getTeamForEdit = async (req, res) => {
  try {
    const filter = await editScopeFilter(req.user, req.params.id);
    const team = filter && (await loadTeamForEdit(filter));
    if (!team) return sendError(res, EDIT_NOT_FOUND, 404);
    return sendSuccess(res, `${team.label} details fetched`, { team });
  } catch (err) {
    console.error("getTeamForEdit failed:", err);
    return sendError(res, "Failed to load details", 500);
  }
};

// PATCH /api/teams/:id  (Master Admin, Brokerage Admin)
exports.updateTeam = async (req, res) => {
  try {
    const filter = await editScopeFilter(req.user, req.params.id);
    const team = filter && (await Team.findOne(filter));
    if (!team) return sendError(res, EDIT_NOT_FOUND, 404);

    const label = TEAM_TYPE_CONFIG[team.teamType]?.label || "Team";
    const body = req.body || {};

    // Optimistic concurrency: don't overwrite a newer save by someone else
    if (
      body.updatedAt &&
      team.updatedAt &&
      new Date(body.updatedAt).getTime() !== team.updatedAt.getTime()
    ) {
      return sendError(
        res,
        `This ${label.toLowerCase()} was changed by someone else. Reload the page to see the latest details.`,
        409,
      );
    }

    // teamType never comes from the client on edit
    const { errors, data } = parseBusinessInfo(body, team.teamType);
    const banking = await resolveBankingUpdate(body.banking, team);
    errors.push(...banking.errors);
    if (errors.length) return sendError(res, errors.join(", "), 400);

    team.set({ ...data, anniversaryDate: data.anniversaryDate || null });
    applyBankingUpdate(team, banking, req.user._id);

    const changed = team.isModified();
    if (changed) await team.save();
    // Audit: call the same audit-log helper used in utils/lpm.js here
    // (action "TEAM_UPDATED", entity team._id, performer req.user._id).

    const updated = await loadTeamForEdit({ _id: team._id });
    return sendSuccess(
      res,
      changed ? `${label} updated` : "No changes to save",
      { team: updated },
    );
  } catch (err) {
    if (err?.name === "ValidationError") {
      return sendError(res, err.message, 400);
    }
    console.error("updateTeam failed:", err);
    return sendError(res, "Failed to update details", 500);
  }
};
