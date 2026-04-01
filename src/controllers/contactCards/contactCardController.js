const Company = require("../../models/ContactCards/Company");
const Contact = require("../../models/ContactCards/Contact");
const { sendError, sendSuccess } = require("../../utils/response");

exports.createContact = async (req, res) => {
  try {
    const payload = req.body;

    if (!payload.preferredName?.trim()) {
      return sendError(res, "Preferred name is required", 400);
    }

    if (!payload.legalName?.trim()) {
      return sendError(res, "Legal name is required", 400);
    }

    if (!payload.primaryEmail?.trim()) {
      return sendError(res, "Primary email is required", 400);
    }

    if (!payload.contactType) {
      return sendError(res, "Contact type is required", 400);
    }

    const nameNorm = payload.preferredName.trim().toLowerCase();
    const emailNorm = payload.primaryEmail?.trim().toLowerCase();

    // pre-check
    const existing = await Contact.findOne({
      preferredNameNormalized: nameNorm,
      primaryEmailNormalized: emailNorm,
      isActive: true,
    });

    if (existing) {
      return sendError(
        res,
        "Contact with same name and email already exists",
        409,
      );
    }

    const contact = await Contact.create({
      ...payload,
      createdBy: req.user?._id,
    });

    return sendSuccess(res, "Contact created successfully", {
      contact,
    });
  } catch (err) {
    if (err.code === 11000) {
      return sendError(
        res,
        "Contact with same name and email already exists",
        409,
      );
    }
    return sendError(res, err.message, 500);
  }
};

exports.getContactsList = async (req, res) => {
  try {
    const {
      search = "",
      contactType,
      status,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const skip = (page - 1) * limit;

    /* =============================
       COMPANIES → Vendor cards
    ============================= */

    const companyQuery = { isActive: true };

    if (search) {
      companyQuery.companyNameNormalized = {
        $regex: search.toLowerCase(),
        $options: "i",
      };
    }

    const companies = await Company.find(companyQuery)
      .populate("vendorType", "name")
      .lean();

    const companyCards = companies.map((c) => ({
      _id: c._id,
      name: c.companyName,
      email: c.companyEmail,
      phone: c.companyPhone,
      contactType: "Vendor",
      status: c.isActive ? "Active" : "Inactive",
      cardType: "company",
      createdAt: c.createdAt,
    }));

    /* =============================
   CONTACTS → Individual cards
============================= */
    const contactsQuery = {};

    //  search support
    if (search) {
      contactsQuery.$or = [
        { preferredName: { $regex: search, $options: "i" } },
        { primaryEmail: { $regex: search, $options: "i" } },
      ];
    }

    // filter by contact type
    if (contactType && contactType !== "Vendor" && contactType !== "All") {
      contactsQuery.contactType = contactType;
    }

    // STATUS FILTER (CRITICAL FIX)
    if (status && status !== "All") {
      contactsQuery.status = status; // uses schema status field
    } else {
      contactsQuery.isActive = true; // default behavior
    }

    //  fetch contacts
    const contactDocs = await Contact.find(contactsQuery).lean();

    //  map to card format (KEEP FE CONTRACT SAME)
    const individualCards = contactDocs.map((c) => ({
      _id: c._id,
      name: c.preferredName,
      email: c.primaryEmail,
      phone: c.phones?.mobile || "",
      contactType: c.contactType,
      status: c.status || (c.isActive ? "Active" : "Inactive"),
      cardType: "individual",
      createdAt: c.createdAt,
    }));

    /* =============================
       MERGE
    ============================= */
    let contacts = [...companyCards, ...individualCards];

    if (contactType && contactType !== "All") {
      contacts = contacts.filter((c) => c.contactType === contactType);
    }

    // sort
    contacts.sort((a, b) => {
      const aValue = a[sortBy] || "";
      const bValue = b[sortBy] || "";

      if (typeof aValue === "string") {
        return sortOrder === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return sortOrder === "asc"
        ? aValue > bValue
          ? 1
          : -1
        : aValue < bValue
          ? 1
          : -1;
    });

    // pagination
    const total = contacts.length;
    const paginated = contacts.slice(skip, skip + Number(limit));

    return sendSuccess(res, "Contacts fetched", {
      contacts: paginated,
      total,
    });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

exports.getContactDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const contact = await Contact.findById(id)
      .populate("lastUpdatedBy", "preferredName email")
      .lean();

    if (!contact) {
      return sendError(res, "Contact not found", 404);
    }

    /* =============================
       FLATTEN FOR FE (VERY IMPORTANT)
    ============================= */

    const response = {
      _id: contact._id,
      contactType: contact.contactType,
      status: contact.status,
      lastUpdatedBy:
        contact.lastUpdatedBy?.preferredName || contact.lastUpdatedBy?.email,
      lastUpdatedAt: contact.lastUpdatedAt || contact.updatedAt,

      // primary
      preferredName: contact.preferredName,
      legalName: contact.legalName,
      email: contact.primaryEmail,
      alternateEmail: contact.alternateEmail,

      mobile: contact.phones?.mobile,
      home: contact.phones?.home,
      work: contact.phones?.work,
      other: contact.phones?.other,

      /* ===== TENANT ===== */
      ...(contact.tenantInfo && {
        bankName: contact.tenantInfo.bankName,
        homeBranch: contact.tenantInfo.homeBranch,
        hasInsurance: contact.tenantInfo.insurance?.hasInsurance,
        insuranceProvider: contact.tenantInfo.insurance?.provider,
        insurancePolicy: contact.tenantInfo.insurance?.policy,
        tenantNotes: contact.tenantInfo.notes,
      }),

      /* ===== OWNER ===== */
      ...(contact.ownerInfo && {
        preferredCommunication: contact.ownerInfo.preferredCommunication,
        ownerHasInsurance: contact.ownerInfo.insurance?.hasInsurance,
        ownerInsuranceProvider: contact.ownerInfo.insurance?.provider,
        ownerInsurancePolicy: contact.ownerInfo.insurance?.policy,
        ownerNotes: contact.ownerInfo.notes,
      }),

      /* ===== TEAM ===== */
      ...(contact.teamInfo && {
        teamAttachedTo: contact.teamInfo.teamAttachedTo,
        teamType: contact.teamInfo.teamType,
        userRole: contact.teamInfo.userRole,
        permissions: contact.teamInfo.permissions,
      }),
    };

    return sendSuccess(res, "Contact fetched", {
      contact: response,
    });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// Bulk Delete Contacts
exports.bulkDeleteContacts = async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return sendError(res, "No items provided", 400);
    }

    const contactIds = [];
    const companyIds = [];

    // Separate IDs by type
    for (const item of items) {
      if (item.type === "contact") {
        contactIds.push(item.id);
      } else if (item.type === "company") {
        companyIds.push(item.id);
      }
    }

    // Soft delete (BEST PRACTICE)
    const [contactsResult, companiesResult] = await Promise.all([
      contactIds.length
        ? Contact.updateMany({ _id: { $in: contactIds } }, { isActive: false })
        : null,

      companyIds.length
        ? Company.updateMany({ _id: { $in: companyIds } }, { isActive: false })
        : null,
    ]);

    return sendSuccess(res, "Items deleted successfully", {
      contactsDeleted: contactsResult?.modifiedCount || 0,
      companiesDeleted: companiesResult?.modifiedCount || 0,
    });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};
