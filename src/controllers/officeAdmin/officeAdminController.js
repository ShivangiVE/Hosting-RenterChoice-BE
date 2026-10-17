const mongoose = require("mongoose");
const { TEAM_ROLES } = require("../../constants/roles");
const User = require("../../models/User");
const { sendSuccess, sendError } = require("../../utils/response");
const { toggleUserStatus } = require("../../utils/toggleUserStatus");
const {
  createUserAccount,
  toCreatedUser,
} = require("../../utils/createUserAccount");

const INTERNAL_ROLES = TEAM_ROLES;

// ─── Team list helpers ──────────────────────────────────────────────────────
// Page sizes match User.itemsPerPagePreference, so the FE "items per page"
// preference always maps to an allowed value.
const ALLOWED_LIMITS = [10, 25, 50, 100];
const DEFAULT_LIMIT = 10;

// Only what the team table needs — never send password/OTP/session fields.
const TEAM_MEMBER_FIELDS =
  "preferredName legalName fullName firstName lastName email role isActive profileImage createdAt";

const STATUS_FILTERS = {
  active: { isActive: { $ne: false } },
  inactive: { isActive: false },
};

// Escape user input before building a RegExp (prevents ReDoS / regex injection).
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getTeamScope = async (user) => {
  if (user.role === "Admin") return {};

  if (user.role === "BrokerageAdmin") {
    const myOfficeAdmins = await User.find({
      role: "OfficeAdmin",
      createdBy: user._id,
    })
      .select("_id")
      .lean();
    return { createdBy: { $in: myOfficeAdmins.map((a) => a._id) } };
  }

  if (user.role === "OfficeAdmin") return { createdBy: user._id };

  if (INTERNAL_ROLES.includes(user.role)) {
    const self = await User.findById(user._id).select("createdBy").lean();
    return self?.createdBy ? { createdBy: self.createdBy } : null;
  }

  return null;
};

// OfficeAdmin creates internal team users
exports.createInternalUser = async (req, res) => {
  try {
    const { role } = req.body;
    if (!INTERNAL_ROLES.includes(role)) {
      return sendError(res, "Invalid role for internal creation", 400);
    }

    const { user, error, status } = await createUserAccount(req.body, {
      role,
      createdBy: req.user._id,
    });
    if (error) return sendError(res, error, status);

    return sendSuccess(
      res,
      "Internal user created successfully",
      toCreatedUser(user),
      201,
    );
  } catch (err) {
    console.error("createInternalUser error:", err);
    return sendError(res, "Failed to create internal user", 500);
  }
};

// OfficeAdmin can list all team users
// exports.getInternalUsers = async (req, res) => {
//   try {
//     const filter = {
//       role: { $in: INTERNAL_ROLES },
//     };

//     if (req.query.createdBy) {
//       filter.createdBy = req.query.createdBy;
//     }

//     const users = await User.find(filter).select("-password");
//     return sendSuccess(res, "Internal users retrieved successfully", { users });
//   } catch (err) {
//     return sendError(res, "Failed to retrieve internal users", 500);
//   }
// };

/**
 * GET /api/officeAdmin/team-users
 *
 * Query (all optional):
 *   page    1-based page number. If present → paginated response.
 *   limit   10 | 25 | 50 | 100 (default 10)
 *   search  matches name or email (case-insensitive)
 *   status  "active" | "inactive"
 *
 * Without `page` it behaves exactly as before (all users, same shape), so
 * existing screens keep working. With `page` it returns:
 *   { users: [...], pagination: { current, pages, total, limit } }
 */
exports.getInternalUsers = async (req, res) => {
  try {
    const scope = await getTeamScope(req.user);
    if (!scope) {
      return sendError(res, "No associated OfficeAdmin found", 403);
    }

    const filter = { role: { $in: INTERNAL_ROLES }, ...scope };

    const search = String(req.query.search || "")
      .trim()
      .slice(0, 100);
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      filter.$or = [
        { preferredName: rx },
        { legalName: rx },
        { fullName: rx },
        { firstName: rx },
        { lastName: rx },
        { email: rx },
      ];
    }

    const statusFilter =
      STATUS_FILTERS[String(req.query.status || "").toLowerCase()];
    if (statusFilter) Object.assign(filter, statusFilter);

    // ── Legacy (no `page`): unchanged response for existing screens ──
    if (req.query.page === undefined) {
      const users = await User.find(filter)
        .select("-password")
        .populate("createdBy", "preferredName email role");

      return sendSuccess(res, "Internal users retrieved successfully", {
        users,
      });
    }

    // ── Paginated ──
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = ALLOWED_LIMITS.includes(requestedLimit)
      ? requestedLimit
      : DEFAULT_LIMIT;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select(TEAM_MEMBER_FIELDS)
        .sort({ createdAt: -1, _id: -1 }) // stable order across pages
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    return sendSuccess(res, "Internal users retrieved successfully", {
      users,
      pagination: {
        current: page,
        pages: Math.max(Math.ceil(total / limit), 1),
        total,
        limit,
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to retrieve internal users", 500);
  }
};

// ─── Single team member (Settings → My Team → details panel) ────────────────
const MEMBER_DETAIL_FIELDS =
  "preferredName legalName fullName firstName lastName email role isActive profileImage contactInfo emailSignature printfection createdAt";

// Shape sent to the FE. Printfection spend comes from orders, which don't
// exist in this system yet → 0 until that integration is built.
const toMemberDetail = (u) => ({
  _id: u._id,
  preferredName: u.preferredName,
  legalName: u.legalName,
  fullName: u.fullName || "",
  firstName: u.firstName,
  lastName: u.lastName,
  email: u.email,
  role: u.role,
  isActive: u.isActive,
  profileImage: u.profileImage,
  contactInfo: u.contactInfo || "",
  emailSignature: u.emailSignature || "",
  printfection: {
    monthlyBudget: u.printfection?.monthlyBudget ?? 0,
    spentThisMonth: 0, // TODO(Printfection): sum of this month's orders
    addedThisMonth: 0, // TODO(Printfection): budget top-ups this month
    canIssueSwag: Boolean(u.printfection?.canIssueSwag),
  },
});

const findScopedMember = async (
  performer,
  id,
  fields = MEMBER_DETAIL_FIELDS,
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const scope = await getTeamScope(performer);
  if (!scope) return null;
  return User.findOne({
    _id: id,
    role: { $in: INTERNAL_ROLES },
    ...scope,
  }).select(fields);
};

// GET /api/officeAdmin/internal-users/:id
exports.getInternalUserDetail = async (req, res) => {
  try {
    const member = await findScopedMember(req.user, req.params.id);
    if (!member) return sendError(res, "Team member not found", 404);
    return sendSuccess(res, "Team member retrieved", toMemberDetail(member));
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to retrieve team member", 500);
  }
};

exports.updateInternalUser = async (req, res) => {
  try {
    const member = await findScopedMember(req.user, req.params.id);
    if (!member) return sendError(res, "Team member not found", 404);

    const { email, contactInfo, emailSignature, role, printfection } = req.body;

    if (email !== undefined) {
      const nextEmail = String(email).toLowerCase().trim();
      if (!nextEmail) return sendError(res, "Email is required", 400);
      if (nextEmail !== member.email) {
        const taken = await User.exists({
          email: nextEmail,
          _id: { $ne: member._id },
        });
        if (taken) return sendError(res, "Email already in use", 409);
        member.email = nextEmail;
      }
    }

    if (role !== undefined) {
      if (!INTERNAL_ROLES.includes(role)) {
        return sendError(res, "Invalid role", 400);
      }
      member.role = role;
    }

    if (contactInfo !== undefined) {
      member.contactInfo = String(contactInfo).trim();
    }
    if (emailSignature !== undefined) {
      member.emailSignature = String(emailSignature).trim();
    }

    if (printfection?.canIssueSwag !== undefined) {
      member.set(
        "printfection.canIssueSwag",
        Boolean(printfection.canIssueSwag),
      );
    }

    await member.save();
    return sendSuccess(
      res,
      "Team member updated successfully",
      toMemberDetail(member),
    );
  } catch (err) {
    if (err.name === "ValidationError") return sendError(res, err.message, 400);
    console.error(err);
    return sendError(res, "Failed to update team member", 500);
  }
};

// Activating and Deactivating the user.
exports.toggleUserStatus = (req, res) =>
  toggleUserStatus(req, res, {
    scopeCheck: async (targetUser, performer) => {
      if (!INTERNAL_ROLES.includes(targetUser.role)) return false;
      const scope = await getTeamScope(performer);
      if (!scope) return false;
      return Boolean(await User.exists({ _id: targetUser._id, ...scope }));
    },
  });

// OfficeAdmin can delete internal users they created (Admin: any team user).
// Scope-checked: previously ANY internal user could delete ANY user by id.
exports.deleteInternalUser = async (req, res) => {
  try {
    const target = await User.findById(req.params.id).select("role createdBy");
    if (!target) {
      return sendError(res, "User not found", 404);
    }

    if (target._id.equals(req.user._id)) {
      return sendError(res, "You can't delete your own account", 400);
    }

    const isTeamUser = INTERNAL_ROLES.includes(target.role);
    const isCreator = target.createdBy?.equals(req.user._id);
    const allowed = isTeamUser && (req.user.role === "Admin" || isCreator);

    if (!allowed) {
      return sendError(
        res,
        "You can only remove members of your own team",
        403,
      );
    }

    await target.deleteOne();
    return sendSuccess(res, "Internal user deleted successfully");
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to delete internal user", 500);
  }
};

// OfficeAdmin can update internal user role
exports.updateInternalUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!INTERNAL_ROLES.includes(role)) {
      return sendError(res, "Invalid role", 400);
    }

    const member = await findScopedMember(req.user, req.params.id, "-password");
    if (!member) return sendError(res, "User not found", 404);

    member.role = role;
    await member.save();

    return sendSuccess(res, "Internal user role updated successfully", {
      user: member,
    });
  } catch (err) {
    return sendError(res, "Failed to update internal user role", 500);
  }
};
