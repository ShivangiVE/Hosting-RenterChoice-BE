const Building = require("../../models/Building");
const {
  searchEntityRegistry,
} = require("../../registries/searchEntityRegistry");
const { sendSuccess, sendError } = require("../../utils/response");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PER_ENTITY_LIMIT = 6;
const OVERALL_LIMIT = 30;
const MIN_QUERY_LENGTH = 2;

const emptyResult = (q) => ({
  query: q,
  totalCount: 0,
  groups: [],
});

// GET /api/search?q=...
exports.globalSearch = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();

    if (q.length < MIN_QUERY_LENGTH) {
      return sendSuccess(res, "Global search results fetched", emptyResult(q));
    }

    const regex = new RegExp(escapeRegex(q), "i");

    // Shared cross-entity lookup: which buildings match by address/name,
    // reused by every entity branch that links to a Building — mirrors
    // the buildingIds-lookup pattern already used in
    // workOrderQueryBuilder.js instead of re-querying Building per entity.
    const buildingIds = await Building.find({
      $or: [
        { "formData.address": regex },
        { "formData.fullAddress": regex },
        { "formData.buildingName": regex },
        { buildingAbbreviation: regex },
      ],
    }).distinct("_id");

    const ctx = { regex, buildingIds };

    // Admin always sees every registered entity (matches the "null means
    // Admin — no restriction" convention used by resolveTeamUserIds
    // everywhere else). Every other role is gated per-entity below.
    const entries = Object.entries(searchEntityRegistry).filter(
      ([, entry]) =>
        req.user.role === "Admin" || entry.allowedRoles(req.user.role),
    );

    if (entries.length === 0) {
      return sendSuccess(res, "Global search results fetched", emptyResult(q));
    }

    // Build one aggregation branch per entity, resolving each entity's own
    // row-level scope exactly the way its own listing endpoint does.
    const branches = [];
    for (const [entityType, entry] of entries) {
      const scope = await entry.buildScope(req);
      if (scope === null) continue; // this user can see none of this entity type

      const searchMatch = entry.buildSearchMatch(regex, ctx);
      const match =
        scope && Object.keys(scope).length > 0
          ? { $and: [scope, searchMatch] }
          : searchMatch;

      const pipeline = [
        { $match: match },
        ...(entry.lookups || []),
        { $limit: PER_ENTITY_LIMIT },
        {
          $project: {
            _id: 1,
            createdAt: 1,
            ...entry.project,
          },
        },
        { $addFields: { entityType: { $literal: entityType } } },
      ];

      branches.push({
        model: entry.model,
        collection: entry.model.collection.name,
        pipeline,
      });
    }

    if (branches.length === 0) {
      return sendSuccess(res, "Global search results fetched", emptyResult(q));
    }

    // Union every branch together — same $unionWith pattern already used
    // in getVendorEntities (workOrderController.js) to merge WorkOrder +
    // ServiceAgreement into one paginated feed.
    const [first, ...rest] = branches;
    const pipeline = [
      ...first.pipeline,
      ...rest.map((branch) => ({
        $unionWith: { coll: branch.collection, pipeline: branch.pipeline },
      })),
      // Cheap relevance boost: an exact/prefix title match floats to the
      // top of its recency-sorted pool. Requires Mongo 4.2+ ($regexMatch).
      {
        $addFields: {
          _exactMatch: {
            $cond: [
              {
                $regexMatch: {
                  input: { $toLower: { $ifNull: ["$title", ""] } },
                  regex: `^${escapeRegex(q.toLowerCase())}`,
                },
              },
              1,
              0,
            ],
          },
        },
      },
      { $sort: { _exactMatch: -1, createdAt: -1 } },
      { $limit: OVERALL_LIMIT },
    ];

    const rawResults = await first.model.aggregate(pipeline);

    const results = rawResults.map((doc) => {
      const entry = searchEntityRegistry[doc.entityType];
      return {
        id: doc._id,
        entityType: doc.entityType,
        label: entry.label,
        title: doc.title,
        subtitle: doc.subtitle || null,
        route: entry.buildRoute(doc),
      };
    });

    const groupsMap = {};
    results.forEach((r) => {
      if (!groupsMap[r.entityType]) {
        groupsMap[r.entityType] = {
          entityType: r.entityType,
          label: r.label,
          results: [],
        };
      }
      groupsMap[r.entityType].results.push(r);
    });

    return sendSuccess(res, "Global search results fetched", {
      query: q,
      totalCount: results.length,
      groups: Object.values(groupsMap).map((g) => ({
        ...g,
        count: g.results.length,
      })),
    });
  } catch (err) {
    return sendError(res, err.message || "Global search failed", 500);
  }
};
