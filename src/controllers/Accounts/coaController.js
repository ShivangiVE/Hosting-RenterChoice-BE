const { ACCOUNT_TYPES } = require("../../constants/coaConstants");
const Account = require("../../models/Accounts/Account");
const SubAccount = require("../../models/Accounts/SubAccount");

const {
  generateCOAAccountNumber,
} = require("../../utils/coaAccountNumberGenerator");
const { validateAccountNumber } = require("../../utils/coaValidation");
const Counter = require("../../utils/Counter");
const { sendError, sendSuccess } = require("../../utils/response");

exports.createAccount = async (req, res) => {
  try {
    const {
      accountName,
      accountType,
      accountNumber,
      autoGenerate,
      autoApplyPrepayment = false,
      brokerageIncome = false,
      description,
      subAccounts = [],
    } = req.body;

    // =========================
    // Required Validations
    // =========================

    if (!accountName?.trim()) {
      return sendError(res, "Account name is required", 400);
    }

    if (!accountType) {
      return sendError(res, "Account type is required", 400);
    }

    if (!autoGenerate && !accountNumber) {
      return sendError(
        res,
        "Account number is required when auto generate is false",
        400,
      );
    }

    // =========================
    // Validate Account Type
    // =========================

    const VALID_TYPES = ["BANK", "LIABILITY", "RE", "INCOME", "EXPENSE"];

    if (!VALID_TYPES.includes(accountType)) {
      return sendError(res, "Invalid account type", 400);
    }

    // =========================
    // Prevent Duplicate Account Name
    // =========================

    const accountNameExists = await Account.findOne({
      isActive: true,
      accountName: {
        $regex: `^${accountName.trim()}$`,
        $options: "i",
      },
    });
    if (accountNameExists) {
      return sendError(res, "Account name already exists", 400);
    }

    let finalAccountNumber;

    if (autoGenerate) {
      finalAccountNumber = await generateCOAAccountNumber(accountType);
    } else {
      finalAccountNumber = accountNumber;
    }

    if (!validateAccountNumber(accountType, finalAccountNumber)) {
      return sendError(res, `Invalid account number for ${accountType}`, 400);
    }

    const exists = await Account.findOne({
      accountNumber: String(finalAccountNumber),
      isActive: true,
    });

    if (exists) {
      return sendError(res, "Account number already exists", 400);
    }

    const account = await Account.create({
      accountName,
      accountType,
      accountNumber: String(finalAccountNumber),
      autoApplyPrepayment,
      brokerageIncome,
      description,
      createdBy: req.user._id,
    });

    if (!autoGenerate) {
      const config = ACCOUNT_TYPES[accountType];

      const manualNumber = Number(finalAccountNumber);

      const expectedSequence = manualNumber - config.startFrom;

      await Counter.findOneAndUpdate(
        {
          _id: config.counterId,
          sequence_value: { $lt: expectedSequence },
        },
        {
          $set: {
            sequence_value: expectedSequence,
          },
        },
        {
          upsert: true,
        },
      );
    }

    if (subAccounts.length) {
      const uniqueSubAccounts = [
        ...new Set(subAccounts.map((name) => name.trim())),
      ];

      await SubAccount.insertMany(
        uniqueSubAccounts.map((name) => ({
          account: account._id,
          name,
        })),
      );
    }

    const createdSubAccounts = await SubAccount.find({
      account: account._id,
    });

    return sendSuccess(res, "Account created", {
      account,
      subAccounts: createdSubAccounts,
    });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

exports.previewAccountNumber = async (req, res) => {
  try {
    const { accountType } = req.query;

    const config = ACCOUNT_TYPES[accountType];

    if (!config) {
      return sendError(res, "Invalid account type", 400);
    }

    const counter = await Counter.findById(config.counterId);

    const nextNumber = String(
      config.startFrom + ((counter?.sequence_value || 0) + 1),
    );

    return sendSuccess(res, "Preview generated", {
      accountNumber: nextNumber,
    });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

exports.updateAccount = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      accountName,
      autoApplyPrepayment = false,
      brokerageIncome = false,
      description,
      subAccounts = [],
    } = req.body;

    const account = await Account.findById(id);

    if (!account) {
      return sendError(res, "Account not found", 404);
    }

    if (req.body.accountType && req.body.accountType !== account.accountType) {
      return sendError(
        res,
        "Account type cannot be changed after account creation",
        400,
      );
    }

    if (
      req.body.accountNumber &&
      req.body.accountNumber !== account.accountNumber
    ) {
      return sendError(
        res,
        "Account number cannot be changed after account creation",
        400,
      );
    }

    // =========================
    // Validation
    // =========================

    if (!accountName?.trim()) {
      return sendError(res, "Account name is required", 400);
    }

    // =========================
    // Duplicate Name Check
    // =========================

    const existingAccount = await Account.findOne({
      _id: { $ne: id },
      isActive: true,
      accountName: {
        $regex: `^${accountName.trim()}$`,
        $options: "i",
      },
    });

    if (existingAccount) {
      return sendError(res, "Account name already exists", 400);
    }

    // =========================
    // Update Account
    // =========================

    account.accountName = accountName.trim();
    account.autoApplyPrepayment = autoApplyPrepayment;
    account.brokerageIncome = brokerageIncome;
    account.description = description?.trim() || "";
    account.updatedBy = req.user._id;

    await account.save();

    // =========================
    // Sync Sub Accounts
    // =========================

    const existingSubAccounts = await SubAccount.find({
      account: account._id,
    });

    const existingNames = existingSubAccounts.map((item) => ({
      originalName: item.name,
      normalizedName: item.name.trim().toLowerCase(),
    }));

    const incomingSubAccounts = [
      ...new Set(subAccounts.map((item) => item.trim()).filter(Boolean)),
    ];

    const incomingNames = incomingSubAccounts.map((item) => item.toLowerCase());

    // =========================
    // Soft Delete Removed Sub Accounts
    // =========================

    const removedNames = existingNames
      .filter((item) => !incomingNames.includes(item.normalizedName))
      .map((item) => item.originalName);

    if (removedNames.length) {
      await SubAccount.updateMany(
        {
          account: account._id,
          name: {
            $in: removedNames,
          },
          isActive: true,
        },
        {
          $set: {
            isActive: false,
            deletedAt: new Date(),
            deletedBy: req.user._id,
          },
        },
      );
    }

    // =========================
    // Reactivate Previously Deleted Sub Accounts
    // =========================

    const subAccountsToReactivate = existingSubAccounts
      .filter(
        (sub) =>
          !sub.isActive &&
          incomingNames.includes(sub.name.trim().toLowerCase()),
      )
      .map((sub) => sub._id);

    if (subAccountsToReactivate.length) {
      await SubAccount.updateMany(
        {
          _id: {
            $in: subAccountsToReactivate,
          },
        },
        {
          $set: {
            isActive: true,
            deletedAt: null,
            deletedBy: null,
          },
        },
      );
    }

    // =========================
    // Create New Sub Accounts
    // =========================

    const newNames = incomingSubAccounts.filter(
      (name) =>
        !existingSubAccounts.some(
          (sub) => sub.name.trim().toLowerCase() === name.trim().toLowerCase(),
        ),
    );

    if (newNames.length) {
      await SubAccount.insertMany(
        newNames.map((name) => ({
          account: account._id,
          name,
        })),
      );
    }

    const updatedSubAccounts = await SubAccount.find({
      account: account._id,
      isActive: true,
    });

    return sendSuccess(res, "Account updated successfully", {
      account,
      subAccounts: updatedSubAccounts,
    });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

exports.getAccounts = async (req, res) => {
  try {
    const { search, accountType, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const filter = {
      isActive: true,
    };

    if (search?.trim()) {
      const searchTerm = search.trim();

      filter.$or = [
        {
          accountName: {
            $regex: searchTerm,
            $options: "i",
          },
        },
        {
          accountNumber: {
            $regex: searchTerm,
            $options: "i",
          },
        },
      ];
    }

    if (accountType) {
      filter.accountType = accountType;
    }

    const total = await Account.countDocuments(filter);

    const accounts = await Account.find(filter)
      .populate("createdBy", "preferredName")
      .sort({
        accountNumber: 1,
      })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();

    const accountIds = accounts.map((account) => account._id);
    const subAccounts = await SubAccount.find({
      account: {
        $in: accountIds,
      },
      isActive: true,
    }).lean();

    const subAccountMap = {};

    subAccounts.forEach((subAccount) => {
      const accountId = subAccount.account.toString();

      if (!subAccountMap[accountId]) {
        subAccountMap[accountId] = [];
      }

      subAccountMap[accountId].push(subAccount.name);
    });

    const accountsWithSubAccounts = accounts.map((account) => ({
      ...account,

      subAccounts: subAccountMap[account._id.toString()] || [],
    }));

    return sendSuccess(res, "Accounts fetched", {
      accounts: accountsWithSubAccounts,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

exports.getAccountById = async (req, res) => {
  try {
    const { id } = req.params;

    const account = await Account.findOne({
      _id: id,
      isActive: true,
    });

    if (!account) {
      return sendError(res, "Account not found", 404);
    }

    const subAccounts = await SubAccount.find({
      account: id,
    });

    return sendSuccess(res, "Account fetched", {
      account,
      subAccounts,
    });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

exports.getAccountsDropdown = async (req, res) => {
  try {
    const accounts = await Account.find({
      isActive: true,
    })
      .select("_id accountNumber accountName")
      .sort({
        accountNumber: 1,
      });

    return sendSuccess(res, "Accounts dropdown", {
      accounts: accounts.map((account) => ({
        value: account._id,
        label: `${account.accountNumber} - ${account.accountName}`,
      })),
    });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

exports.archiveAccount = async (req, res) => {
  try {
    const account = await Account.findById(req.params.id);

    if (!account) {
      return sendError(res, "Account not found", 404);
    }

    if (!account.isActive) {
      return sendError(res, "Account already archived", 400);
    }

    account.isActive = false;
    account.deletedAt = new Date();
    account.deletedBy = req.user._id;

    await account.save();

    await SubAccount.updateMany(
      {
        account: account._id,
      },
      {
        $set: {
          isActive: false,
          deletedAt: new Date(),
          deletedBy: req.user._id,
        },
      },
    );

    return sendSuccess(res, "Account archived successfully");
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

exports.getSubAccounts = async (req, res) => {
  const { accountId } = req.params;

  const subAccounts = await SubAccount.find({
    account: accountId,
    isActive: true,
  });

  return sendSuccess(res, "Sub Accounts", { subAccounts });
};
