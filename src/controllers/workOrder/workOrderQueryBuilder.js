const mongoose = require("mongoose");
const Building = require("../../models/Building");
const User = require("../../models/User");
const WODynamicStatus = require("../../models/WODynamicStatus");
const Category = require("../../models/repairCategories");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const buildWorkOrderFilter = async (query, baseFilter = {}) => {
  const filter = { ...baseFilter };
  const {
    status,
    dynamicStatus,
    category,
    vendor,
    building,
    city,
    portfolio,
    tenancy,
    search,
    dueDate,
    workOrderType,
  } = query;

  if (status && status !== "All") filter.status = status;

  if (dynamicStatus && dynamicStatus !== "All") {
    const statusObj = await WODynamicStatus.findOne({
      $or: [{ _id: dynamicStatus }, { name: new RegExp(dynamicStatus, "i") }],
    });
    if (statusObj) filter.dynamicStatus = statusObj._id;
  }

  if (workOrderType && workOrderType !== "All") {
    filter.workOrderType = workOrderType;
  }

  if (dueDate && dueDate !== "All") {
    const start = new Date(dueDate);
    const end = new Date(dueDate);

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    filter.dueDate = {
      $gte: start,
      $lte: end,
    };
  }

  if (category && category !== "All") {
    if (mongoose.Types.ObjectId.isValid(category)) {
      const catDoc = await Category.findById(category).select("name");
      filter.category = catDoc ? { $in: [category, catDoc.name] } : category;
    } else {
      filter.category = category;
    }
  }

  // Don't let a caller-supplied vendor filter widen a company-scoped baseFilter
  if (vendor && vendor !== "All" && !baseFilter.vendor) filter.vendor = vendor;

  if (building && building !== "All") filter.building = building;
  if (tenancy && tenancy !== "All") filter.tenant = tenancy;

  if (portfolio && portfolio !== "All") {
    const buildingIds = await Building.find({ portfolio }).distinct("_id");
    filter.building = filter.building
      ? {
          $in: buildingIds.filter(
            (id) => id.toString() === filter.building.toString(),
          ),
        }
      : { $in: buildingIds };
  }

  if (city && city !== "All") {
    const buildingIds = await Building.find({
      "formData.city": new RegExp(city, "i"),
    }).distinct("_id");
    filter.building = filter.building ? filter.building : { $in: buildingIds };
  }

  if (search && search.trim() !== "") {
    const regex = new RegExp(search, "i");
    const buildingIds = await Building.find({
      $or: [
        { "formData.address": regex },
        { "formData.fullAddress": regex },
        { buildingAbbreviation: regex },
      ],
    }).distinct("_id");

    const searchConditions = [
      { workOrderNumber: regex },
      { description: regex },
      { building: { $in: buildingIds } },
    ];
    filter.$or = filter.$or
      ? filter.$or.concat(searchConditions)
      : searchConditions;
  }

  return filter;
};

const buildServiceAgreementFilter = async (query, baseFilter = {}) => {
  const filter = { ...baseFilter };
  const {
    dueDate,
    category,
    vendor,
    building,
    portfolio,
    vendorStatus,
    status,
    search,
  } = query;

  // Due Date
  if (dueDate && dueDate !== "All") {
    const start = new Date(dueDate);
    const end = new Date(dueDate);
    end.setHours(23, 59, 59, 999);
    filter.initialDueDate = { $gte: start, $lte: end };
  }

  // Category
  if (category && category !== "All") {
    if (mongoose.Types.ObjectId.isValid(category)) {
      const catDoc = await Category.findById(category).select("name");
      filter.category = catDoc ? { $in: [category, catDoc.name] } : category;
    } else {
      filter.category = category;
    }
  }

  if (vendor && vendor !== "All" && !baseFilter.vendor) {
    filter.vendor = vendor;
  }

  if (status && status !== "All") {
    filter.status = status;
  }

  if (vendorStatus && vendorStatus !== "All") {
    const vendorIds = await User.find({ status: vendorStatus }).distinct("_id");

    if (baseFilter.vendor?.$in) {
      const baseIds = baseFilter.vendor.$in.map((id) => id.toString());
      filter.vendor = {
        $in: vendorIds.filter((id) => baseIds.includes(id.toString())),
      };
    } else {
      filter.vendor = { $in: vendorIds };
    }
  }

  // Building
  if (building && building !== "All") {
    filter.building = building;
  }

  // Portfolio (via Building lookup)
  if (portfolio && portfolio !== "All") {
    const buildingIds = await Building.find({ portfolio }).distinct("_id");
    filter.building = filter.building ? filter.building : { $in: buildingIds };
  }

  // Global Search
  if (search && search.trim() !== "") {
    const regex = new RegExp(search, "i");

    const buildingIds = await Building.find({
      $or: [
        { "formData.address": regex },
        { "formData.fullAddress": regex },
        { buildingAbbreviation: regex },
      ],
    }).distinct("_id");

    const vendorIds = await User.find({
      $or: [{ companyName: regex }, { technicianName: regex }],
    }).distinct("_id");

    const searchConditions = [
      { serviceAgreementNumber: regex },
      { description: regex },
      { building: { $in: buildingIds } },
      { vendor: { $in: vendorIds } },
    ];

    filter.$or = filter.$or
      ? filter.$or.concat(searchConditions)
      : searchConditions;
  }

  return filter;
};

const buildVendorWorkOrderMatch = async (vendorId, query) => {
  const {
    tab,
    category,
    dynamicStatus,
    dueDate,
    completedDate,
    declinedStartDate,
    declinedEndDate,
    search,
  } = query;

  let match = {
    $or: [
      { vendor: vendorId },
      {
        "vendorResponses.user": vendorId,
        "vendorResponses.response": "pending",
      },
    ],
  };

  if (query.vendorResponse === "pending") {
    match.vendorResponse = "pending";
    match.status = "open";
  }

  if (!query.vendorResponse) {
    if (tab === "Pending") {
      const excluded = await WODynamicStatus.find({
        name: { $in: ["Completed", "Declined"] },
      }).distinct("_id");
      match.status = "open";
      match.vendorResponse = "accepted";
      if (excluded.length > 0) match.dynamicStatus = { $nin: excluded };
    } else if (tab === "Completed") {
      const completedStatus = await WODynamicStatus.findOne({
        name: "Completed",
      });
      match.$or = [
        { status: "closed" },
        completedStatus ? { dynamicStatus: completedStatus._id } : null,
      ].filter(Boolean);
    } else if (tab === "Declined") {
      match.$or = [
        { vendor: vendorId, vendorResponse: "declined" },
        {
          "vendorResponses.user": vendorId,
          "vendorResponses.response": "declined",
        },
      ];
    }
  }

  if (category && category !== "All") match.category = category;

  if (dynamicStatus && dynamicStatus !== "All") {
    if (dynamicStatus === "primary-closed") {
      if (tab === "Completed") {
        match.status = "closed";
        delete match.dynamicStatus;
      } else {
        return null;
      }
    } else {
      const dyn = await findDynamicStatus(dynamicStatus);
      if (!dyn) return null;

      if (tab === "Pending") {
        if (["Completed", "Declined"].includes(dyn.name)) return null;
        match.dynamicStatus = dyn._id;
      } else if (tab === "Completed") {
        if (dyn.name !== "Completed") return null;
      } else if (tab === "Declined") {
        if (dyn.name !== "Declined") return null;
      } else {
        match.dynamicStatus = dyn._id;
      }
    }
  }

  if (dueDate && dueDate !== "All") {
    const start = new Date(dueDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dueDate);
    end.setHours(23, 59, 59, 999);
    match.dueDate = { $gte: start, $lte: end };
  }

  if (completedDate && completedDate !== "All") {
    const start = new Date(completedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(completedDate);
    end.setHours(23, 59, 59, 999);
    match.completeDate = { $gte: start, $lte: end };
  }

  if (declinedStartDate || declinedEndDate) {
    match.declinedDate = {};
    if (declinedStartDate) {
      const start = new Date(declinedStartDate);
      start.setHours(0, 0, 0, 0);
      match.declinedDate.$gte = start;
    }
    if (declinedEndDate) {
      const end = new Date(declinedEndDate);
      end.setHours(23, 59, 59, 999);
      match.declinedDate.$lte = end;
    }
  }

  if (search && search.trim() !== "") {
    const regex = new RegExp(search, "i");
    const buildingIds = await Building.find({
      $or: [
        { "formData.address": regex },
        { "formData.fullAddress": regex },
        { buildingAbbreviation: regex },
      ],
    }).distinct("_id");
    if (buildingIds.length === 0) return null;
    match.building = { $in: buildingIds };
  }

  return match;
};

const buildVendorServiceAgreementMatch = async (vendorId, query) => {
  const {
    tab,
    category,
    search,
    dueDate,
    completedDate,
    declinedStartDate,
    declinedEndDate,
    dynamicStatus,
  } = query;

  if (dynamicStatus && dynamicStatus !== "All" && dynamicStatus !== "") {
    return null;
  }

  let match = {
    $or: [
      { vendor: vendorId },
      {
        "vendorResponses.user": vendorId,
        "vendorResponses.response": "pending",
      },
    ],
  };

  if (query.vendorResponse === "pending") {
    match.vendorResponse = "pending";
    match.status = "open";
  }

  if (!query.vendorResponse) {
    if (tab === "Pending") {
      match.status = "open";
      match.vendorResponse = "accepted";
    } else if (tab === "Completed") {
      match.status = "closed";
    } else if (tab === "Declined") {
      match.$or = [
        { vendor: vendorId, vendorResponse: "declined" },
        {
          "vendorResponses.user": vendorId,
          "vendorResponses.response": "declined",
        },
      ];
    }
  }

  if (category && category !== "All") {
    let categoryName = null;
    if (category.startsWith("sa:")) {
      categoryName = category.slice(3);
    } else {
      const catDoc = await Category.findById(category).select("name").lean();
      categoryName = catDoc ? catDoc.name : null;
    }
    match.category = categoryName
      ? { $regex: `^${escapeRegex(categoryName)}$`, $options: "i" }
      : "__no_match__";
  }

  if (dueDate) {
    const start = new Date(dueDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dueDate);
    end.setHours(23, 59, 59, 999);
    match.initialDueDate = { $gte: start, $lte: end };
  }

  if (completedDate) {
    const start = new Date(completedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(completedDate);
    end.setHours(23, 59, 59, 999);
    match.closedAt = { $gte: start, $lte: end };
  }

  if (declinedStartDate || declinedEndDate) {
    match.declinedDate = {};
    if (declinedStartDate)
      match.declinedDate.$gte = new Date(declinedStartDate);
    if (declinedEndDate) {
      const end = new Date(declinedEndDate);
      end.setHours(23, 59, 59, 999);
      match.declinedDate.$lte = end;
    }
  }

  if (search && search.trim() !== "") {
    const regex = new RegExp(search, "i");
    const buildingIds = await Building.find({
      $or: [
        { "formData.address": regex },
        { "formData.fullAddress": regex },
        { buildingAbbreviation: regex },
      ],
    }).distinct("_id");
    if (buildingIds.length === 0) return null;
    match.building = { $in: buildingIds };
  }

  return match;
};

module.exports = {
  buildWorkOrderFilter,
  buildServiceAgreementFilter,
  buildVendorWorkOrderMatch,
  buildVendorServiceAgreementMatch,
};
