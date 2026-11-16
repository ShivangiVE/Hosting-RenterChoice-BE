const mongoose = require("mongoose");
const Company = require("../../models/ContactCards/Company");
const PaymentInfoChangeRequest = require("../../models/ContactCards/PaymentInfoChangeRequest");
const User = require("../../models/User");
const Bank = require("../../models/Accounts/Bank");
const { encryptField, decryptField } = require("../../utils/fieldEncryption");
const { sendSuccess, sendError } = require("../../utils/response");
const {
  validateEpayPayload,
  pickEpayInput,
  toPublicEpay,
} = require("../../utils/epayPayload");
const AuditService = require("../../services/auditService");
const {
  createNotification,
  resolveNotificationsForEntity,
} = require("../../services/notificationService");
const {
  notifyPaymentInfoReviewers,
  REQUESTED,
} = require("../../services/paymentInfoRequestNotifier");

const REVIEWED = "PAYMENT_INFO_CHANGE_REVIEWED";
const REVIEW_ACTIONS = ["approve", "reject"];
const ENCRYPTED_PATH = "proposed.accountNumberEncrypted";

const displayName = (u) =>
  u?.technicianName || u?.preferredName || u?.email || "A vendor";

// Masked request summary (safe for the vendor and the reviewer)
const toSummary = (r, viewerId) => ({
  _id: r._id,
  status: r.status,
  changeType: r.changeType,
  submittedAt: r.createdAt,
  requestedBy: displayName(r.requestedBy),
  isMine: String(r.requestedBy?._id || r.requestedBy) === String(viewerId),
  proposed: toPublicEpay(r.proposed),
});

const audit = (entry) =>
  AuditService.logActivity({ module: "Company", ...entry }).catch((e) =>
    console.error("Payment info audit failed:", e),
  );

const clearAlerts = (requestId) =>
  resolveNotificationsForEntity(requestId, [REQUESTED]).catch((e) =>
    console.error("Resolve payment info notifications failed:", e),
  );

// The vendor's company (always read fresh — never trusted from the client)
const getVendorCompanyId = async (userId) => {
  const vendor = await User.findById(userId).select("company isActive").lean();
  return vendor?.isActive !== false ? vendor?.company || null : null;
};

/* ═════════════════════════════ Vendor ═════════════════════════════ */

// GET /api/payment-info-requests/mine
exports.getMyCompanyPaymentInfo = async (req, res) => {
  try {
    const companyId = await getVendorCompanyId(req.user._id);
    if (!companyId) {
      return sendSuccess(res, "Payment info fetched", { company: null });
    }

    const [company, pending, lastDecision, banks] = await Promise.all([
      Company.findById(companyId)
        .select("companyName companyAccountNumber isActive paymentInfo.epay")
        .lean(),
      PaymentInfoChangeRequest.findOne({
        company: companyId,
        status: "pending",
      })
        .populate("requestedBy", "technicianName preferredName email")
        .lean(),
      PaymentInfoChangeRequest.findOne({
        company: companyId,
        status: { $in: ["approved", "rejected"] },
      })
        .sort({ reviewedAt: -1 })
        .select("status reviewNotes reviewedAt changeType")
        .lean(),
      // Bank list comes with this call, so the vendor never needs the internal bank API
      Bank.find({ isActive: true })
        .select(
          "name institutionNumber accountNumberMin accountNumberMax typicalLengthNote",
        )
        .sort({ name: 1 })
        .lean(),
    ]);

    if (!company || !company.isActive) {
      return sendSuccess(res, "Payment info fetched", { company: null });
    }

    return sendSuccess(res, "Payment info fetched", {
      company: {
        _id: company._id,
        companyName: company.companyName,
        companyAccountNumber: company.companyAccountNumber,
      },
      epay: toPublicEpay(company.paymentInfo?.epay),
      pendingRequest: pending ? toSummary(pending, req.user._id) : null,
      lastDecision: lastDecision || null,
      banks,
    });
  } catch (err) {
    console.error("Error fetching vendor payment info:", err);
    return sendError(res, "Failed to load payment info", 500);
  }
};

// POST /api/payment-info-requests   (vendor submits; nothing is saved to the company yet)
exports.submitPaymentInfoChangeRequest = async (req, res) => {
  try {
    const input = pickEpayInput(req.body);

    const vendor = await User.findById(req.user._id)
      .select("company isActive technicianName preferredName email role")
      .lean();
    if (!vendor?.company || vendor.isActive === false) {
      return sendError(res, "You are not linked to a company", 403);
    }

    const company = await Company.findOne({
      _id: vendor.company,
      isActive: true,
    })
      .select("companyName paymentInfo.epay")
      .lean();
    if (!company) {
      return sendError(
        res,
        "Your company is inactive, so its payment info can't be changed",
        409,
      );
    }

    const { errors, bank } = await validateEpayPayload(input);
    if (errors.length) return sendError(res, errors.join(" "), 400);

    // One open request per company: you can replace your own, not a colleague's
    const open = await PaymentInfoChangeRequest.findOne({
      company: company._id,
      status: "pending",
    })
      .populate("requestedBy", "technicianName preferredName email")
      .lean();

    if (open && String(open.requestedBy?._id) !== String(vendor._id)) {
      return sendError(
        res,
        `A change submitted by ${displayName(open.requestedBy)} is already waiting for approval.`,
        409,
      );
    }
    if (open) {
      const replaced = await PaymentInfoChangeRequest.findOneAndUpdate(
        { _id: open._id, status: "pending" },
        { $set: { status: "superseded" }, $unset: { [ENCRYPTED_PATH]: 1 } },
      );
      if (replaced) clearAlerts(open._id);
    }

    const current = company.paymentInfo?.epay;
    let request;
    try {
      request = await PaymentInfoChangeRequest.create({
        company: company._id,
        requestedBy: vendor._id,
        requestedByRole: vendor.role,
        changeType: current?.bankId ? "update" : "add",
        proposed: {
          bankInfoMethod: input.bankInfoMethod,
          bankId: bank._id,
          bankName: bank.name,
          institutionNumber: bank.institutionNumber,
          transit: input.transit,
          accountNumberLast4: input.accountNumber.slice(-4),
          accountNumberEncrypted: encryptField(input.accountNumber),
          billingFirstName: input.billingFirstName,
          billingLastName: input.billingLastName,
          billingAddress: input.billingAddress,
          billingEmail: input.billingEmail,
        },
        previous: current?.bankId
          ? {
              bankName: current.bankName,
              transit: current.transit,
              accountNumberLast4: current.accountNumberLast4,
              updatedAt: current.updatedAt,
            }
          : undefined,
      });
    } catch (err) {
      if (err.code === 11000) {
        return sendError(
          res,
          "Another change for your company was just submitted. Please refresh and try again.",
          409,
        );
      }
      throw err;
    }

    audit({
      action: "REQUEST_PAYMENT_INFO_CHANGE",
      entityId: company._id,
      userId: vendor._id,
      description: `${displayName(vendor)} requested to ${request.changeType} E-Pay payment info for ${company.companyName} (account ending in ${request.proposed.accountNumberLast4}) — awaiting approval`,
    });

    notifyPaymentInfoReviewers(request, {
      companyName: company.companyName,
      requesterName: displayName(vendor),
    }).catch((e) => console.error("Payment info notification failed:", e));

    return sendSuccess(
      res,
      "Submitted for approval. The new details will be used once our team approves them.",
      {
        pendingRequest: toSummary(
          { ...request.toObject(), requestedBy: vendor },
          vendor._id,
        ),
      },
      201,
    );
  } catch (err) {
    console.error("Error submitting payment info change:", err);
    return sendError(res, "Failed to submit payment info", 500);
  }
};

// PATCH /api/payment-info-requests/mine/withdraw   (only the vendor who submitted it)
exports.withdrawMyPaymentInfoRequest = async (req, res) => {
  try {
    const companyId = await getVendorCompanyId(req.user._id);
    if (!companyId)
      return sendError(res, "You are not linked to a company", 403);

    const withdrawn = await PaymentInfoChangeRequest.findOneAndUpdate(
      { company: companyId, status: "pending", requestedBy: req.user._id },
      { $set: { status: "withdrawn" }, $unset: { [ENCRYPTED_PATH]: 1 } },
      { new: true },
    ).lean();

    if (!withdrawn) {
      return sendError(res, "You have no request waiting for approval", 404);
    }

    clearAlerts(withdrawn._id);
    audit({
      action: "WITHDRAW_PAYMENT_INFO_CHANGE",
      entityId: companyId,
      userId: req.user._id,
      description: "Vendor withdrew a pending payment info change",
    });

    return sendSuccess(res, "Request withdrawn");
  } catch (err) {
    console.error("Error withdrawing payment info request:", err);
    return sendError(res, "Failed to withdraw the request", 500);
  }
};

/* ═════════════════════════ Office Admin / Internal Team ═════════════════════════ */

// GET /api/payment-info-requests/:id   (details for the Approve / Reject popup)
exports.getPaymentInfoChangeRequest = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return sendError(res, "Invalid request id", 400);

    const r = await PaymentInfoChangeRequest.findById(id)
      .populate(
        "company",
        "companyName companyAccountNumber isActive paymentInfo.epay",
      )
      .populate("requestedBy", "technicianName preferredName email role")
      .populate("reviewedBy", "preferredName email")
      .lean();
    if (!r) return sendError(res, "Request not found", 404);

    const currentEpay = r.company?.paymentInfo?.epay;

    return sendSuccess(res, "Request fetched", {
      request: {
        _id: r._id,
        status: r.status,
        changeType: r.changeType,
        submittedAt: r.createdAt,
        company: r.company && {
          _id: r.company._id,
          companyName: r.company.companyName,
          companyAccountNumber: r.company.companyAccountNumber,
          isActive: r.company.isActive,
        },
        requestedBy: {
          name: displayName(r.requestedBy),
          email: r.requestedBy?.email || "",
          role: r.requestedByRole || r.requestedBy?.role || "",
        },
        proposed: toPublicEpay(r.proposed),
        current: toPublicEpay(currentEpay),
        // Someone changed the saved details after the vendor submitted
        changedSinceSubmitted:
          !!currentEpay?.updatedAt &&
          new Date(currentEpay.updatedAt) > new Date(r.createdAt),
        reviewedBy: r.reviewedBy
          ? r.reviewedBy.preferredName || r.reviewedBy.email
          : null,
        reviewedAt: r.reviewedAt,
        reviewNotes: r.reviewNotes || "",
      },
    });
  } catch (err) {
    console.error("Error fetching payment info request:", err);
    return sendError(res, "Failed to load the request", 500);
  }
};

// GET /api/payment-info-requests/:id/reveal   (full proposed account number, audited)
exports.revealProposedAccountNumber = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return sendError(res, "Invalid request id", 400);

    const r = await PaymentInfoChangeRequest.findById(id)
      .select(`+${ENCRYPTED_PATH} status company`)
      .lean();
    if (!r || r.status !== "pending" || !r.proposed?.accountNumberEncrypted) {
      return sendError(res, "This account number is no longer available", 404);
    }

    const accountNumber = decryptField(r.proposed.accountNumberEncrypted);

    audit({
      action: "REVEAL_PROPOSED_PAYMENT_INFO",
      entityId: r.company,
      userId: req.user._id,
      description:
        "Viewed full proposed bank account number on a pending vendor request",
    });

    return sendSuccess(res, "Account number revealed", { accountNumber });
  } catch (err) {
    console.error("Error revealing proposed account number:", err);
    return sendError(res, "Failed to reveal account number", 500);
  }
};

// Tell the reviewer WHY the request can't be reviewed any more
const sendAlreadyHandled = async (res, id) => {
  const r = await PaymentInfoChangeRequest.findById(id).select("status").lean();
  if (!r) return sendError(res, "Request not found", 404);
  const reason = {
    withdrawn: "The vendor withdrew this request",
    superseded: "The vendor replaced this request with a newer one",
  }[r.status];
  return sendError(
    res,
    reason || "This request has already been reviewed",
    409,
  );
};

// PATCH /api/payment-info-requests/:id/review   { action: approve|reject, notes }
exports.reviewPaymentInfoChangeRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const action = req.body?.action;
    const notes =
      typeof req.body?.notes === "string"
        ? req.body.notes.trim().slice(0, 1000)
        : "";

    if (!mongoose.isValidObjectId(id))
      return sendError(res, "Invalid request id", 400);
    if (!REVIEW_ACTIONS.includes(action)) {
      return sendError(res, "Action must be approve or reject", 400);
    }
    if (action === "reject" && !notes) {
      return sendError(
        res,
        "Please give a reason so the vendor knows why",
        400,
      );
    }

    const now = new Date();
    const reviewerId = req.user._id;

    /* ───── Reject ───── */
    if (action === "reject") {
      const r = await PaymentInfoChangeRequest.findOneAndUpdate(
        { _id: id, status: "pending" },
        {
          $set: {
            status: "rejected",
            reviewedBy: reviewerId,
            reviewedAt: now,
            reviewNotes: notes,
          },
          $unset: { [ENCRYPTED_PATH]: 1 }, // no longer needed
        },
        { new: true },
      )
        .populate("company", "companyName")
        .lean();
      if (!r) return sendAlreadyHandled(res, id);

      finishReview(r, { approved: false, notes, reviewerId });
      return sendSuccess(res, "Request rejected", { status: r.status });
    }

    /* ───── Approve ───── */
    // 1) Claim it first, so two reviewers can never both apply it
    const claimed = await PaymentInfoChangeRequest.findOneAndUpdate(
      { _id: id, status: "pending" },
      {
        $set: {
          status: "approved",
          reviewedBy: reviewerId,
          reviewedAt: now,
          ...(notes && { reviewNotes: notes }),
        },
      },
      { new: true },
    )
      .select(`+${ENCRYPTED_PATH}`)
      .lean();
    if (!claimed) return sendAlreadyHandled(res, id);

    // Put it back to pending if the company can't be updated
    const release = () =>
      PaymentInfoChangeRequest.updateOne(
        { _id: id, status: "approved", appliedAt: null },
        {
          $set: { status: "pending" },
          $unset: { reviewedBy: 1, reviewedAt: 1, reviewNotes: 1 },
        },
      );

    try {
      const p = claimed.proposed;
      const [bankOk, requesterOk] = await Promise.all([
        Bank.exists({ _id: p.bankId, isActive: true }),
        User.exists({
          _id: claimed.requestedBy,
          company: claimed.company,
          isActive: true,
        }),
      ]);
      if (!bankOk) {
        await release();
        return sendError(
          res,
          "The selected bank is no longer available. Reject this request so the vendor can choose another bank.",
          409,
        );
      }
      if (!requesterOk) {
        await release();
        return sendError(
          res,
          "The vendor who submitted this is no longer part of the company. Please reject it.",
          409,
        );
      }
      if (!p.accountNumberEncrypted) {
        await release();
        return sendError(
          res,
          "This request is incomplete. Please reject it.",
          409,
        );
      }

      // 2) Apply to the company — records who entered it and who approved it
      const company = await Company.findOneAndUpdate(
        { _id: claimed.company, isActive: true },
        {
          $set: {
            "paymentInfo.epay": {
              bankInfoMethod: p.bankInfoMethod,
              bankId: p.bankId,
              bankName: p.bankName,
              institutionNumber: p.institutionNumber,
              transit: p.transit,
              accountNumberLast4: p.accountNumberLast4,
              accountNumberEncrypted: p.accountNumberEncrypted,
              billingFirstName: p.billingFirstName,
              billingLastName: p.billingLastName,
              billingAddress: p.billingAddress,
              billingEmail: p.billingEmail,
              updatedAt: now,
              updatedBy: claimed.requestedBy, // the vendor who entered it
              approvedBy: reviewerId,
              approvedAt: now,
              source: "vendor",
              changeRequest: claimed._id,
            },
          },
        },
        { new: true },
      )
        .select("companyName")
        .lean();

      if (!company) {
        await release();
        return sendError(
          res,
          "This company is inactive, so its payment info can't be changed.",
          409,
        );
      }

      // 3) Mark applied and drop the encrypted copy from the request
      await PaymentInfoChangeRequest.updateOne(
        { _id: id },
        { $set: { appliedAt: now }, $unset: { [ENCRYPTED_PATH]: 1 } },
      );

      finishReview(
        { ...claimed, company },
        { approved: true, notes, reviewerId },
      );
      return sendSuccess(res, "Payment info approved and saved", {
        status: "approved",
      });
    } catch (err) {
      await release().catch(() => {});
      throw err;
    }
  } catch (err) {
    console.error("Error reviewing payment info request:", err);
    return sendError(res, "Failed to review the request", 500);
  }
};

// Shared after-review steps (never fail the response)
function finishReview(r, { approved, notes, reviewerId }) {
  const companyName = r.company?.companyName || "your company";
  const last4 = r.proposed?.accountNumberLast4;

  clearAlerts(r._id);

  createNotification({
    user: r.requestedBy,
    role: "Vendor",
    type: REVIEWED,
    title: approved ? "Payment Info Approved" : "Payment Info Not Approved",
    message: approved
      ? `Your payment info for ${companyName} (account ending ${last4}) was approved and is now in use.`
      : `Your payment info for ${companyName} was not approved. Reason: ${notes}`,
    entityType: "PaymentInfoChangeRequest",
    entityId: r._id,
  }).catch((e) => console.error("Payment info review notification failed:", e));

  audit({
    action: approved
      ? "APPROVE_PAYMENT_INFO_CHANGE"
      : "REJECT_PAYMENT_INFO_CHANGE",
    entityId: r.company?._id || r.company,
    userId: reviewerId,
    description: approved
      ? `Approved vendor E-Pay change for ${companyName} (account ending in ${last4})`
      : `Rejected vendor E-Pay change for ${companyName}. Reason: ${notes}`,
  });
}
