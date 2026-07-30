const mongoose = require("mongoose");
const Company = require("../../models/ContactCards/Company");
const VendorType = require("../../models/ContactCards/VendorType");
const User = require("../../models/User");
const { generateAccountNumber } = require("../../utils/generateAccountNumber");
const { sendSuccess, sendError } = require("../../utils/response");
const resolveCompanyVendorIds = require("../../utils/resolveCompanyVendorIds");
const {
  buildWorkOrderFilter,
  buildServiceAgreementFilter,
} = require("../workOrder/workOrderQueryBuilder");
const WorkOrder = require("../../models/WorkOrder");
const ServiceAgreement = require("../../models/ServiceAgreement");

// Create Company
exports.createCompany = async (req, res) => {
  try {
    const {
      companyName,
      vendorType,
      paymentName,
      companyEmail,
      companyPhone,
      contactName,
      contactEmail,
      contactPhone,
      notes,
      isETransferClient,
    } = req.body;

    // Validation
    if (!companyName?.trim()) {
      return sendError(res, "Company name is required", 400);
    }

    if (!vendorType) {
      return sendError(res, "Vendor type is required", 400);
    }

    //  Verify vendor type exists
    const vendorExists = await VendorType.findById(vendorType);
    if (!vendorExists) {
      return sendError(res, "Invalid vendor type", 400);
    }

    //  ATOMIC ACCOUNT NUMBER
    const accountNumber = await generateAccountNumber({
      counterId: "companyAccountNumber",
      startFrom: 100,
      minDigits: 3,
      maxDigits: 4,
    });

    const company = await Company.create({
      companyName: companyName.trim(),
      vendorType,
      paymentName,
      companyEmail,
      companyPhone,
      contactName,
      contactEmail,
      contactPhone,
      notes,
      isETransferClient: Boolean(isETransferClient),
      companyAccountNumber: accountNumber,
      createdBy: req.user?._id,
    });

    return sendSuccess(res, "Company created successfully", { company }, 201);
  } catch (err) {
    if (err.code === 11000) {
      return sendError(res, "Company already exists", 400);
    }
    return sendError(res, err.message, 500);
  }
};

// List of Companies
exports.listCompanies = async (req, res) => {
  try {
    const { search = "", vendorType = "", page = 1, limit = 50 } = req.query;

    const query = {
      isActive: true,
    };

    if (search) {
      query.companyName = {
        $regex: search.trim(),
        $options: "i",
      };
    }

    if (vendorType && mongoose.Types.ObjectId.isValid(vendorType)) {
      query.vendorType = vendorType;
    }

    const companies = await Company.find(query)
      .populate("vendorType", "name")
      .sort({ companyName: 1 })
      .limit(Number(limit))
      .skip((page - 1) * limit)
      .lean();

    return sendSuccess(res, "Companies fetched", { companies });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// For Filters and Dropdowns
exports.getCompaniesList = async (req, res) => {
  try {
    const companies = await Company.find({
      isActive: true,
    })
      .select("companyName")
      .sort({ companyName: 1 })
      .lean();

    return sendSuccess(res, "Companies fetched", {
      companies,
    });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// Get single company details
exports.getCompanyDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { includeVendors } = req.query;

    //  fetch company
    const company = await Company.findById(id)
      .populate("vendorType", "name")
      .populate("lastUpdatedBy", "preferredName email")
      .lean();

    if (!company) {
      return sendError(res, "Company not found", 404);
    }

    let vendors = [];

    // optionally fetch vendors
    if (includeVendors === "true") {
      vendors = await User.find({
        role: "Vendor",
        company: id,
        isActive: true,
      })
        .select("technicianName email accountNumber createdAt")
        .sort({ createdAt: -1 })
        .lean();
    }

    return sendSuccess(res, "Company fetched", {
      company,
      vendors,
    });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

exports.searchCompanies = async (req, res) => {
  try {
    const { q = "", limit = 20 } = req.query;

    const query = { isActive: true };

    if (q.trim()) {
      // Uses the companyNameNormalized index for fast prefix/substring search
      query.companyName = { $regex: q.trim(), $options: "i" };
    }

    const companies = await Company.find(query)
      .select("companyName companyAccountNumber vendorType")
      .populate("vendorType", "name")
      .sort({ companyName: 1 })
      .limit(Math.min(Number(limit) || 20, 50))
      .lean();

    return sendSuccess(res, "Companies fetched", { companies });
  } catch (err) {
    return sendError(res, err.message || "Failed to search companies", 500);
  }
};

// Get Work Orders by Company
exports.getCompanyWorkOrders = async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const vendorIds = await resolveCompanyVendorIds(id);
    if (vendorIds.length === 0) {
      return sendSuccess(res, "Work orders fetched", {
        workOrders: [],
        pagination: { current: page, pages: 0, total: 0 },
      });
    }

    const filter = await buildWorkOrderFilter(req.query, {
      vendor: { $in: vendorIds },
    });

    const [workOrders, total] = await Promise.all([
      WorkOrder.find(filter)
        .populate("building", "buildingAbbreviation formData.address")
        .populate("vendor", "companyName technicianName")
        .populate("category", "name")
        .populate("dynamicStatus", "name description isDefault")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      WorkOrder.countDocuments(filter),
    ]);

    return sendSuccess(res, "Work orders fetched", {
      workOrders,
      pagination: { current: page, pages: Math.ceil(total / limit), total },
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch company work orders",
      500,
    );
  }
};

// Get Service Agreements by Company
exports.getCompanyServiceAgreements = async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const vendorIds = await resolveCompanyVendorIds(id);
    if (vendorIds.length === 0) {
      return sendSuccess(res, "Service agreements fetched", {
        serviceAgreements: [],
        pagination: { current: page, pages: 0, total: 0 },
      });
    }

    const filter = await buildServiceAgreementFilter(req.query, {
      vendor: { $in: vendorIds },
    });

    const [serviceAgreements, total] = await Promise.all([
      ServiceAgreement.find(filter)
        .populate("building", "buildingAbbreviation formData.address")
        .populate("vendor", "companyName technicianName status")
        .populate("category", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ServiceAgreement.countDocuments(filter),
    ]);

    return sendSuccess(res, "Service agreements fetched", {
      serviceAgreements,
      pagination: { current: page, pages: Math.ceil(total / limit), total },
    });
  } catch (err) {
    return sendError(
      res,
      err.message || "Failed to fetch company service agreements",
      500,
    );
  }
};

exports.getCompanyOverview = async (req, res) => {
  try {
    const { id } = req.params;
    const vendorIds = await resolveCompanyVendorIds(id);
    const vendorFilter = { vendor: { $in: vendorIds } };

    const [openWorkOrders, closedWorkOrders, activeServiceAgreements] =
      await Promise.all([
        WorkOrder.countDocuments({ ...vendorFilter, status: "open" }),
        WorkOrder.countDocuments({ ...vendorFilter, status: "closed" }),
        ServiceAgreement.countDocuments({
          ...vendorFilter,
          status: { $ne: "closed" },
        }),
      ]);

    return sendSuccess(res, "Company overview fetched", {
      vendorCount: vendorIds.length,
      openWorkOrders,
      closedWorkOrders,
      activeServiceAgreements,
    });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// Update Company
exports.updateCompany = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      companyName,
      vendorType,
      paymentName,
      companyEmail,
      companyPhone,
      contactName,
      contactEmail,
      contactPhone,
      notes,
      isETransferClient,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, "Invalid company id", 400);
    }

    if (!companyName?.trim()) {
      return sendError(res, "Company name is required", 400);
    }

    if (!vendorType) {
      return sendError(res, "Vendor type is required", 400);
    }

    // verify vendor type
    const vendorExists = await VendorType.findById(vendorType);
    if (!vendorExists) {
      return sendError(res, "Invalid vendor type", 400);
    }

    const company = await Company.findByIdAndUpdate(
      id,
      {
        companyName: companyName.trim(),
        vendorType,
        paymentName,
        companyEmail,
        companyPhone,
        contactName,
        contactEmail,
        contactPhone,
        notes,
        isETransferClient: Boolean(isETransferClient),
        lastUpdatedBy: req.user?._id,
        lastUpdatedAt: new Date(),
      },
      { new: true },
    ).populate([
      { path: "vendorType", select: "preferredName" },
      { path: "lastUpdatedBy", select: "preferredName email" },
    ]);

    if (!company) {
      return sendError(res, "Company not found", 404);
    }

    return sendSuccess(res, "Company updated successfully", { company });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// Remove Vendor From Company
exports.removeVendorFromCompany = async (req, res) => {
  try {
    const { companyId, vendorId } = req.params;

    const vendor = await User.findOneAndUpdate(
      {
        _id: vendorId,
        company: companyId,
        role: "Vendor",
        isActive: true,
      },
      {
        isActive: false,
      },
      { new: true },
    );

    if (!vendor) {
      return sendError(res, "Vendor not found in this company", 404);
    }

    return sendSuccess(res, "Vendor removed successfully");
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};
