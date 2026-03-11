const mongoose = require("mongoose");
const Company = require("../../models/ContactCards/Company");
const VendorType = require("../../models/ContactCards/VendorType");
const User = require("../../models/User");
const { generateAccountNumber } = require("../../utils/generateAccountNumber");
const { sendSuccess, sendError } = require("../../utils/response");

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
