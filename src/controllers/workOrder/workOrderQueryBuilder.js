const mongoose = require("mongoose");
const Building = require("../../models/Building");
const User = require("../../models/User");
const WODynamicStatus = require("../../models/WODynamicStatus");
const Category = require("../../models/repairCategories");

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

module.exports = { buildWorkOrderFilter, buildServiceAgreementFilter };
