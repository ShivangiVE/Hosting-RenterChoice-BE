/**
 * Global Search Entity Registry
 * ------------------------------
 * One entry per module that should be searchable from the global search
 * bar. To add a new searchable module, add an entry here — nothing else
 * in the search feature needs to change. Same registry-driven pattern as
 * chargeFormRegistry.js / reminderCycleRegistry.js / communicationConfig.js.
 *
 * Each entry:
 *   model          — the Mongoose model
 *   label          — display label shown as the result-group header
 *   allowedRoles(role) -> bool
 *                  — coarse MODULE-level gate. Mirrors the role groups that
 *                    already protect this entity's own routes (see
 *                    config/roles.js and the relevant routes/*.js file).
 *                    Admin always passes this check regardless (handled in
 *                    the controller, not here), matching the "null means
 *                    Admin — no restriction" convention used everywhere
 *                    else in this codebase (resolveTeamUserIds, etc).
 *   buildScope(req) -> Promise<matchObject | null>
 *                  — row-level (data) scope, evaluated per request.
 *                    Return {} for "no extra restriction beyond the role
 *                    gate", a Mongo match fragment to further restrict
 *                    which documents this user may see, or null to mean
 *                    "this user can see NONE of this entity type right
 *                    now" (branch is skipped entirely, same convention as
 *                    buildVendorWorkOrderMatch returning null).
 *   buildSearchMatch(regex, ctx) -> matchObject
 *                  — the actual "does this document match the typed
 *                    query" condition. `ctx.buildingIds` is a shared,
 *                    precomputed list of Building _ids whose address/name
 *                    matched the query — reuse it instead of re-querying
 *                    Building per entity (same buildingIds-lookup pattern
 *                    already used in workOrderQueryBuilder.js).
 *   lookups        — optional extra aggregation stages (e.g. $lookup) run
 *                    BEFORE the $project below, only when a subtitle needs
 *                    a field from a referenced collection.
 *   project        — extra $project fields, in addition to _id/createdAt,
 *                    that resolve `title` and `subtitle` to whatever this
 *                    result should show in the dropdown.
 *   buildRoute(doc) -> string
 *                  — frontend URL for a result.
 *                    ⚠️ PLACEHOLDER PATHS: I don't have your React Router
 *                    route config, so these are best-guess paths matching
 *                    the patterns already visible in your codebase (e.g.
 *                    `/work-orders/${id}` from navigateToNotification in
 *                    AdminNavbar.jsx). Confirm/adjust every route below
 *                    against your actual router before shipping.
 */

const WorkOrder = require("../models/WorkOrder");
const ServiceAgreement = require("../models/ServiceAgreement");
const InspectionRequest = require("../models/InspectionRequest");
const Portfolio = require("../models/Portfolio");
const Building = require("../models/Building");
// Confirmed from contactCardController.js / companyController.js requires
// (`require("../../models/ContactCards/Contact")` etc, one level closer to
// src than this file).
const Contact = require("../models/ContactCards/Contact");
const Company = require("../models/ContactCards/Company");
const Task = require("../models/tasks/Task");
const Todo = require("../models/tasks/Todo");
const {
  WORK_ORDER_ROLES,
  ALLOWED_INTERNAL_ROLES,
} = require("../constants/roles");
const resolveTeamUserIds = require("../utils/resolveTeamUserIds");

/**
 * Row-level scope shared by WorkOrder / InspectionRequest / Task / Todo —
 * all four have createdBy + assignedTo fields and already (or plausibly,
 * for Task/Todo — see README) use exactly this "team scope" pattern via
 * resolveTeamUserIds, same as getWorkOrders / getInspectionRequests.
 */
const createdByOrAssignedToScope = async (req) => {
  const allowedUserIds = await resolveTeamUserIds(req.user);
  if (allowedUserIds === null) return {}; // Admin / no restriction
  return {
    $or: [
      { createdBy: { $in: allowedUserIds } },
      { assignedTo: { $in: allowedUserIds } },
    ],
  };
};

/** ServiceAgreement has no assignedTo field — createdBy only (matches getServiceAgreements). */
const createdByOnlyScope = async (req) => {
  const allowedUserIds = await resolveTeamUserIds(req.user);
  if (allowedUserIds === null) return {};
  return { createdBy: { $in: allowedUserIds } };
};

/**
 * No row-level restriction beyond the role gate. Confirmed accurate for
 * Contact/Company — getContactsList / listCompanies genuinely don't call
 * resolveTeamUserIds or filter by createdBy anywhere; every internal role
 * that can reach those routes sees every contact/company today.
 */
const noRowScope = async () => ({});

const searchEntityRegistry = {
  WorkOrder: {
    model: WorkOrder,
    label: "Work Order",
    allowedRoles: (role) => WORK_ORDER_ROLES.includes(role),
    buildScope: createdByOrAssignedToScope,
    buildSearchMatch: (regex, ctx) => ({
      $or: [
        { workOrderNumber: regex },
        { description: regex },
        { building: { $in: ctx.buildingIds } },
      ],
    }),
    lookups: [
      {
        $lookup: {
          from: "buildings",
          localField: "building",
          foreignField: "_id",
          as: "_building",
        },
      },
      { $unwind: { path: "$_building", preserveNullAndEmptyArrays: true } },
    ],
    project: {
      title: "$workOrderNumber",
      //   subtitle: {
      //     $ifNull: ["$_building.formData.address", "$description"],
      //   },
    },
    buildRoute: (doc) => `/work-orders/${doc._id}`,
  },

  ServiceAgreement: {
    model: ServiceAgreement,
    label: "Service Agreement",
    allowedRoles: (role) => WORK_ORDER_ROLES.includes(role),
    buildScope: createdByOnlyScope,
    buildSearchMatch: (regex, ctx) => ({
      $or: [
        { serviceAgreementNumber: regex },
        { description: regex },
        { building: { $in: ctx.buildingIds } },
      ],
    }),
    lookups: [
      {
        $lookup: {
          from: "buildings",
          localField: "building",
          foreignField: "_id",
          as: "_building",
        },
      },
      { $unwind: { path: "$_building", preserveNullAndEmptyArrays: true } },
    ],
    project: {
      title: "$serviceAgreementNumber",
      //   subtitle: {
      //     $ifNull: ["$_building.formData.address", "$description"],
      //   },
    },
    // ⚠️ PLACEHOLDER — confirm the real service-agreement detail route.
    buildRoute: (doc) => `/service-agreements/${doc._id}`,
  },

  InspectionRequest: {
    model: InspectionRequest,
    label: "Inspection",
    // Note: InspectionClerk isn't in ALLOWED_INTERNAL_ROLES / this map at
    // all (separate portal) — this entity type is for the internal Admin
    // portal roles that manage inspections (OfficeAdmin, AccountsTeam, etc).
    allowedRoles: (role) => WORK_ORDER_ROLES.includes(role),
    buildScope: createdByOrAssignedToScope,
    buildSearchMatch: (regex, ctx) => ({
      $or: [
        { inspectionNumber: regex },
        { inspectionType: regex },
        { building: { $in: ctx.buildingIds } },
      ],
    }),
    lookups: [
      {
        $lookup: {
          from: "buildings",
          localField: "building",
          foreignField: "_id",
          as: "_building",
        },
      },
      { $unwind: { path: "$_building", preserveNullAndEmptyArrays: true } },
    ],
    project: {
      title: "$inspectionNumber",
      //   subtitle: {
      //     $ifNull: ["$_building.formData.address", "$inspectionType"],
      //   },
    },
    buildRoute: (doc) => `/inspections/${doc._id}`,
  },

  Portfolio: {
    model: Portfolio,
    label: "Portfolio",
    // getAllPortfolios/getPortfoliosList scope by createdBy via
    // resolveTeamUserIds — identical pattern to ServiceAgreement.
    allowedRoles: (role) => ALLOWED_INTERNAL_ROLES.includes(role),
    buildScope: createdByOnlyScope,
    buildSearchMatch: (regex) => ({
      $and: [
        { status: "Active" },
        {
          $or: [
            { portfolioName: regex },
            { portfolioAbbreviation: regex },
            { portfolioAccountNumber: regex },
          ],
        },
      ],
    }),
    project: {
      title: "$portfolioName",
      //   subtitle: "$portfolioAbbreviation",
    },
    buildRoute: (doc) => `/portfolios/${doc._id}`,
  },

  Building: {
    model: Building,
    label: "Building",
    allowedRoles: (role) => ALLOWED_INTERNAL_ROLES.includes(role),
    buildScope: createdByOnlyScope,
    // Top-level buildings ONLY — Units (parentBuilding set) are handled by
    // the "Unit" entry below so they get their own label/icon/route instead
    // of being lumped in here. `unitNumber` dropped from this match since a
    // top-level building never has one.
    buildSearchMatch: (regex) => ({
      $and: [
        { parentBuilding: null },
        {
          $or: [
            { buildingAbbreviation: regex },
            { "formData.address": regex },
            { "formData.fullAddress": regex },
            { "formData.buildingName": regex },
          ],
        },
      ],
    }),
    project: {
      title: {
        $ifNull: [
          "$formData.fullAddress",
          { $ifNull: ["$formData.address", "$buildingAbbreviation"] },
        ],
      },
      // subtitle: "$formData.city",
    },
    buildRoute: (doc) => `/buildings/${doc._id}`,
  },

  Unit: {
    // Same model/collection as Building — a Unit is a Building doc with
    // parentBuilding set (see buildingController.createUnit). No new
    // model/collection, just a distinctly-scoped registry entry.
    model: Building,
    label: "Unit",
    allowedRoles: (role) => ALLOWED_INTERNAL_ROLES.includes(role),
    // Units carry the same createdBy field as top-level buildings (set in
    // createUnit), so the same team-scope rule applies.
    buildScope: createdByOnlyScope,
    buildSearchMatch: (regex, ctx) => ({
      $and: [
        { parentBuilding: { $ne: null } },
        {
          $or: [
            { unitNumber: regex },
            { buildingAbbreviation: regex },
            { "formData.unitType": regex },
            { "formData.address": regex },
            { "formData.fullAddress": regex },

            { parentBuilding: { $in: ctx.buildingIds } },
          ],
        },
      ],
    }),
    lookups: [
      {
        $lookup: {
          from: "buildings",
          localField: "parentBuilding",
          foreignField: "_id",
          as: "_parentBuilding",
        },
      },
      {
        $unwind: {
          path: "$_parentBuilding",
          preserveNullAndEmptyArrays: true,
        },
      },
    ],
    project: {
      title: "$unitNumber",
      subtitle: {
        $ifNull: [
          "$_parentBuilding.formData.fullAddress",
          {
            $ifNull: [
              "$_parentBuilding.formData.address",
              "$_parentBuilding.buildingAbbreviation",
            ],
          },
        ],
      },
    },

    buildRoute: (doc) => `/buildings/units/${doc._id}`,
  },

  Contact: {
    model: Contact,
    label: "Contact",
    // getContactsList has no row-level scoping today — matched here.
    allowedRoles: (role) => ALLOWED_INTERNAL_ROLES.includes(role),
    buildScope: noRowScope,
    buildSearchMatch: (regex) => ({
      $or: [
        { preferredName: regex },
        { legalName: regex },
        { primaryEmail: regex },
      ],
    }),
    project: {
      title: "$preferredName",
      subtitle: { $ifNull: ["$primaryEmail", "$contactType"] },
    },
    buildRoute: (doc) => `/contacts/${doc._id}`,
  },

  Company: {
    model: Company,
    label: "Company",
    // listCompanies/getCompaniesList has no row-level scoping today — matched here.
    allowedRoles: (role) => ALLOWED_INTERNAL_ROLES.includes(role),
    buildScope: noRowScope,
    buildSearchMatch: (regex) => ({
      $or: [
        { companyName: regex },
        { contactName: regex },
        { companyEmail: regex },
        { companyAccountNumber: regex },
      ],
    }),
    project: {
      title: "$companyName",
      subtitle: { $ifNull: ["$contactName", "$companyEmail"] },
    },
    buildRoute: (doc) => `/companies/${doc._id}`,
  },

  Task: {
    model: Task,
    label: "Task",

    allowedRoles: (role) => ALLOWED_INTERNAL_ROLES.includes(role),
    buildScope: createdByOrAssignedToScope,
    buildSearchMatch: (regex) => ({
      $or: [{ taskNumber: regex }, { description: regex }, { tags: regex }],
    }),
    project: {
      title: "$taskNumber",
    },
    buildRoute: (doc) => `/tasks/${doc._id}`,
  },

  Todo: {
    model: Todo,
    label: "To-Do",
    allowedRoles: (role) => ALLOWED_INTERNAL_ROLES.includes(role),
    buildScope: createdByOrAssignedToScope,
    buildSearchMatch: (regex) => ({
      $or: [{ todoNumber: regex }, { description: regex }, { tags: regex }],
    }),
    project: {
      title: "$todoNumber",
    },
    buildRoute: (doc) => `/todos/${doc._id}`,
  },
};

module.exports = { searchEntityRegistry };
