const {
  canScheduleServiceAgreementAppointment,
} = require("../../domain/workOrderAppointmentRules");
const ServiceAgreement = require("../../models/ServiceAgreement");
const WorkOrderAppointment = require("../../models/WorkOrderAppointment");
const { sendError, sendSuccess } = require("../../utils/response");

const ACTIVE_STATUSES = ["scheduled", "rescheduled"];
const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

exports.getEligibleServiceAgreementsForScheduling = async (req, res) => {
  try {
    const vendorId = req.user._id;

    // Service agreements that already have an active appointment
    const activeApptEntityIds = await WorkOrderAppointment.distinct(
      "entityId",
      {
        vendor: vendorId,
        entityType: "ServiceAgreement",
        status: { $in: ACTIVE_STATUSES },
      },
    );

    const filter = {
      vendor: vendorId,
      vendorResponse: "accepted",
      status: "open",
      ...(activeApptEntityIds.length && {
        _id: { $nin: activeApptEntityIds },
      }),
    };

    const serviceAgreements = await ServiceAgreement.find(filter)
      .select("serviceAgreementNumber building initialDueDate vendorResponse")
      .populate({
        path: "building",
        select: "buildingAbbreviation formData.address",
      })
      .sort({ initialDueDate: 1, createdAt: -1 })
      .lean();

    return sendSuccess(
      res,
      "Eligible service agreements fetched successfully",
      { serviceAgreements, total: serviceAgreements.length },
    );
  } catch (err) {
    console.error("Error fetching eligible service agreements:", err);
    return sendError(
      res,
      err.message || "Failed to fetch eligible service agreements",
      500,
    );
  }
};

exports.createServiceAgreementAppointment = async (req, res) => {
  try {
    const { serviceAgreementId, scheduledDate, timeSlot } = req.body;
    const vendorId = req.user._id;

    // 1. Input validation
    if (
      !serviceAgreementId ||
      !scheduledDate ||
      !timeSlot?.start ||
      !timeSlot?.end
    ) {
      return sendError(res, "Missing required fields", 400);
    }

    // 2. Validate time slot format and logic
    if (!timeRegex.test(timeSlot.start) || !timeRegex.test(timeSlot.end)) {
      return sendError(res, "Invalid time format. Use HH:MM format", 400);
    }
    if (timeSlot.start >= timeSlot.end) {
      return sendError(res, "End time must be after start time", 400);
    }

    // 3. Load service agreement
    const serviceAgreement = await ServiceAgreement.findById(
      serviceAgreementId,
    ).populate("building", "buildingAbbreviation");

    if (!serviceAgreement) {
      return sendError(res, "Service agreement not found", 404);
    }

    // 4. CRITICAL SECURITY CHECK: Vendor ownership
    if (
      !serviceAgreement.vendor ||
      serviceAgreement.vendor.toString() !== vendorId.toString()
    ) {
      return sendError(
        res,
        "This service agreement is not assigned to you",
        403,
      );
    }

    // 5. CRITICAL SECURITY CHECK: Must be accepted
    if (serviceAgreement.vendorResponse !== "accepted") {
      const message =
        serviceAgreement.vendorResponse === "pending"
          ? "You must accept this service agreement before scheduling an appointment"
          : "You cannot schedule appointments for declined service agreements";
      return sendError(res, message, 403);
    }

    // 6. Validate and normalize date
    const scheduleDateObj = new Date(scheduledDate);
    scheduleDateObj.setHours(0, 0, 0, 0);
    if (isNaN(scheduleDateObj.getTime())) {
      return sendError(res, "Invalid scheduled date format", 400);
    }

    // 7. Prevent past bookings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (scheduleDateObj < today) {
      return sendError(res, "Cannot schedule appointment in the past", 400);
    }

    // 8. Prevent same-day bookings in the past (time validation)
    if (scheduleDateObj.getTime() === today.getTime()) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;
      if (timeSlot.start < currentTime) {
        return sendError(res, "Cannot schedule appointment in the past", 400);
      }
    }

    // 9. Business rules validation
    const eligibility = canScheduleServiceAgreementAppointment(
      serviceAgreement,
      scheduleDateObj,
    );
    if (!eligibility.allowed) {
      return sendError(res, eligibility.reason, 400);
    }

    // 10. Redundant explicit status check (defense in depth, matches WO controller style)
    if (serviceAgreement.status === "closed") {
      return sendError(
        res,
        "Cannot schedule appointment for a closed service agreement",
        400,
      );
    }

    // 11. Prevent duplicate active appointments
    const existingAppointment = await WorkOrderAppointment.findOne({
      entityType: "ServiceAgreement",
      entityId: serviceAgreementId,
      status: { $in: ACTIVE_STATUSES },
    });

    if (existingAppointment) {
      return sendError(
        res,
        "An active appointment already exists for this service agreement. Please cancel or reschedule the existing appointment.",
        409,
      );
    }

    // 12. Create appointment
    const appointment = await WorkOrderAppointment.create({
      entityType: "ServiceAgreement",
      entityId: serviceAgreementId,
      building: serviceAgreement.building._id || serviceAgreement.building,
      vendor: vendorId,
      scheduledDate: scheduleDateObj,
      timeSlot: {
        start: timeSlot.start,
        end: timeSlot.end,
      },
      createdBy: vendorId,
      status: "scheduled",
    });

    // 13. Populate for response
    const populatedAppointment = await WorkOrderAppointment.findById(
      appointment._id,
    )
      .populate("entityId", "serviceAgreementNumber description")
      .populate("building", "buildingAbbreviation formData.address");

    return sendSuccess(
      res,
      "Appointment scheduled successfully",
      { appointment: populatedAppointment },
      201,
    );
  } catch (err) {
    console.error("Error creating service agreement appointment:", err);
    return sendError(res, err.message || "Failed to schedule appointment", 500);
  }
};

exports.getServiceAgreementAppointment = async (req, res) => {
  try {
    const { serviceAgreementId } = req.params;
    const vendorId = req.user._id;

    if (!serviceAgreementId) {
      return sendError(res, "Service agreement ID is required", 400);
    }

    const appointment = await WorkOrderAppointment.findOne({
      entityType: "ServiceAgreement",
      entityId: serviceAgreementId,
      vendor: vendorId,
      status: { $in: ACTIVE_STATUSES },
    })
      .populate("entityId", "serviceAgreementNumber")
      .populate("building", "buildingAbbreviation formData.address")
      .sort({ createdAt: -1 });

    if (!appointment) {
      return sendError(
        res,
        "No active appointment found for this service agreement",
        404,
      );
    }

    return sendSuccess(res, "Appointment fetched successfully", {
      appointment,
    });
  } catch (err) {
    console.error("Error fetching service agreement appointment:", err);
    return sendError(res, err.message || "Failed to fetch appointment", 500);
  }
};
