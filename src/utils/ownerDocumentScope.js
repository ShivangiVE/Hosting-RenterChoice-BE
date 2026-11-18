const Portfolio = require("../models/Portfolio");
const Building = require("../models/Building");

const BUILDING_FIELDS =
  "_id portfolio parentBuilding buildingAbbreviation unitNumber formData.address";

/**
 * What an owner may see: their ACTIVE portfolios, the buildings in them,
 * and those buildings' units. Resolved per request so removing an owner,
 * moving a building or deactivating a portfolio takes effect immediately.
 */
async function getOwnerDocumentScope(ownerId) {
  const portfolios = await Portfolio.find({
    owners: ownerId,
    status: { $ne: "Deactivated" },
  })
    .select("portfolioName portfolioAbbreviation")
    .lean();
  const portfolioIds = portfolios.map((p) => p._id);

  if (!portfolioIds.length) {
    return { portfolios: [], portfolioIds: [], buildingIds: [], buildings: [] };
  }

  const direct = await Building.find({ portfolio: { $in: portfolioIds } })
    .select(BUILDING_FIELDS)
    .lean();
  const directIds = direct.map((b) => b._id);

  const units = directIds.length
    ? await Building.find({
        parentBuilding: { $in: directIds },
        _id: { $nin: directIds },
      })
        .select(BUILDING_FIELDS)
        .lean()
    : [];

  // Units inherit the portfolio of their parent building
  const parentPortfolio = new Map(direct.map((b) => [String(b._id), b.portfolio]));
  const buildings = [
    ...direct.map((b) => ({ ...b, ownerPortfolioId: b.portfolio })),
    ...units.map((u) => ({
      ...u,
      ownerPortfolioId: parentPortfolio.get(String(u.parentBuilding)),
    })),
  ];

  return {
    portfolios,
    portfolioIds,
    buildingIds: buildings.map((b) => b._id),
    buildings,
  };
}

async function ownerCanAccessDocument(document, ownerId) {
  if (!document?.publishedToOwner) return false;
  const { portfolioIds, buildingIds } = await getOwnerDocumentScope(ownerId);
  const has = (ids, ref) => {
    const id = ref?._id || ref;
    return !!id && ids.some((x) => String(x) === String(id));
  };
  return (
    has(portfolioIds, document.portfolio) || has(buildingIds, document.building)
  );
}

module.exports = { getOwnerDocumentScope, ownerCanAccessDocument };
