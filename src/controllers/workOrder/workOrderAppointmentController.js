const {
  canScheduleAppointment,
  canRescheduleAppointment,
  canCancelAppointment,
  isAppointmentInPast,
  canScheduleServiceAgreementAppointment,
} = require("../../domain/workOrderAppointmentRules");
const ServiceAgreement = require("../../models/ServiceAgreement");
const WODynamicStatus = require("../../models/WODynamicStatus");
const WorkOrder = require("../../models/WorkOrder");
const WorkOrderAppointment = require("../../models/WorkOrderAppointment");
const { sendError, sendSuccess } = require("../../utils/response");
const ACTIVE_APPOINTMENT_STATUSES = ["scheduled", "rescheduled"];

/**
 * Get eligible work orders for scheduling
 * Only returns work orders that:
 * 1. Are assigned to the logged-in vendor
 * 2. Have vendorResponse = "accepted"
 * 3. Don't have primary status = "closed"
 * 4. Don't have dynamic status = "Completed"
 */
exports.getEligibleWorkOrdersForScheduling = async (req, res) => {
  try {
    const vendorId = req.user._id;

    // Get status IDs to exclude
    const excludedStatuses = await WODynamicStatus.find({
      name: { $in: ["Completed", "Declined"] },
    }).select("_id");

    const excludedStatusIds = excludedStatuses.map((s) => s._id);

    //  Find work orders that already have active appointments
    const activeAppointmentWorkOrderIds = await WorkOrderAppointment.distinct(
      "workOrder",
      {
        vendor: vendorId,
        status: { $in: ["scheduled", "rescheduled"] },
      },
    );

    // STRICT BASE FILTER - All conditions must be met
    const filter = {
      vendor: vendorId,
      vendorResponse: "accepted",
      status: "open",
      ...(excludedStatusIds.length && {
        dynamicStatus: { $nin: excludedStatusIds },
      }),
      ...(activeAppointmentWorkOrderIds.length && {
        _id: { $nin: activeAppointmentWorkOrderIds },
      }),
    };

    const workOrders = await WorkOrder.find(filter)
      .select("workOrderNumber building dueDate dynamicStatus vendorResponse")
      .populate({
        path: "building",
        select: "buildingAbbreviation formData.address",
      })
      .populate("dynamicStatus", "name")
      .sort({ dueDate: 1, createdAt: -1 }) // Prioritize by due date
      .lean();

    // Check for existing appointments
    // const workOrdersWithAppointmentStatus = await Promise.all(
    //   workOrders.map(async (wo) => {
    //     const existingAppointment = await WorkOrderAppointment.findOne({
    //       workOrder: wo._id,
    //       status: { $in: ["scheduled", "rescheduled"] },
    //     }).select("_id scheduledDate status");

    //     return {
    //       ...wo,
    //       hasActiveAppointment: !!existingAppointment,
    //       appointmentDate: existingAppointment?.scheduledDate || null,
    //       appointmentStatus: existingAppointment?.status || null,
    //     };
    //   })
    // );

    return sendSuccess(res, "Eligible work orders fetched successfully", {
      workOrders,
      total: workOrders.length,
    });
  } catch (err) {
    console.error("Error fetching eligible work orders:", err);
    return sendError(
      res,
      err.message || "Failed to fetch eligible work orders",
      500,
    );
  }
};

exports.createAppointment = async (req, res) => {
  try {
    const { workOrderId, scheduledDate, timeSlot } = req.body;
    const vendorId = req.user._id;

    // 1. Input validation
    if (!workOrderId || !scheduledDate || !timeSlot?.start || !timeSlot?.end) {
      return sendError(res, "Missing required fields", 400);
    }

    // 2. Validate time slot format and logic
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(timeSlot.start) || !timeRegex.test(timeSlot.end)) {
      return sendError(res, "Invalid time format. Use HH:MM format", 400);
    }

    if (timeSlot.start >= timeSlot.end) {
      return sendError(res, "End time must be after start time", 400);
    }

    // 3. Load work order with all necessary fields
    const workOrder = await WorkOrder.findById(workOrderId)
      .populate("dynamicStatus", "name")
      .populate("building", "buildingAbbreviation");

    if (!workOrder) {
      return sendError(res, "Work order not found", 404);
    }

    // 4. CRITICAL SECURITY CHECK: Vendor ownership
    if (
      !workOrder.vendor ||
      workOrder.vendor.toString() !== vendorId.toString()
    ) {
      return sendError(res, "This work order is not assigned to you", 403);
    }

    // 5. CRITICAL SECURITY CHECK: Must be accepted
    if (workOrder.vendorResponse !== "accepted") {
      const message =
        workOrder.vendorResponse === "pending"
          ? "You must accept this work order before scheduling an appointment"
          : "You cannot schedule appointments for declined work orders";
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
    const eligibility = await canScheduleAppointment(
      workOrder,
      scheduleDateObj,
    );
    if (!eligibility.allowed) {
      return sendError(res, eligibility.reason, 400);
    }

    // 10. Check status restrictions
    if (workOrder.status === "closed") {
      return sendError(
        res,
        "Cannot schedule appointment for a closed work order",
        400,
      );
    }

    if (["Completed", "Declined"].includes(workOrder.dynamicStatus?.name)) {
      return sendError(
        res,
        `Cannot schedule appointment for a ${workOrder.dynamicStatus.name.toLowerCase()} work order`,
        400,
      );
    }

    // 11. Prevent duplicate active appointments
    const existingAppointment = await WorkOrderAppointment.findOne({
      workOrder: workOrderId,
      status: { $in: ["scheduled", "rescheduled"] },
    });

    if (existingAppointment) {
      return sendError(
        res,
        "An active appointment already exists for this work order. Please cancel or reschedule the existing appointment.",
        409,
      );
    }

    // 12. Create appointment
    const appointment = await WorkOrderAppointment.create({
      workOrder: workOrderId,
      building: workOrder.building._id || workOrder.building,
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
      .populate("workOrder", "workOrderNumber description")
      .populate("building", "buildingAbbreviation formData.address");

    return sendSuccess(
      res,
      "Appointment scheduled successfully",
      {
        appointment: populatedAppointment,
      },
      201,
    );
  } catch (err) {
    console.error("Error creating appointment:", err);
    return sendError(res, err.message || "Failed to schedule appointment", 500);
  }
};

/**
 * Reschedule appointment
 */
exports.rescheduleAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduledDate, timeSlot, reason } = req.body;
    const vendorId = req.user._id;

    // 1. Input validation
    if (!scheduledDate || !timeSlot?.start || !timeSlot?.end) {
      return sendError(res, "Missing required fields", 400);
    }

    // 2. Validate time slot format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(timeSlot.start) || !timeRegex.test(timeSlot.end)) {
      return sendError(res, "Invalid time format. Use HH:MM format", 400);
    }
    if (timeSlot.start >= timeSlot.end) {
      return sendError(res, "End time must be after start time", 400);
    }

    // 3. Find appointment — building populated generically; entity-specific
    //    populate happens further down once we know entityType.
    const appointment = await WorkOrderAppointment.findById(id).populate(
      "building",
      "buildingAbbreviation",
    );

    if (!appointment) {
      return sendError(res, "Appointment not found", 404);
    }

    // 4. Vendor authorization
    if (appointment.vendor.toString() !== vendorId.toString()) {
      return sendError(
        res,
        "You are not authorized to reschedule this appointment",
        403,
      );
    }

    // 5. Check if appointment can be rescheduled
    const rescheduleEligibility = canRescheduleAppointment(appointment);
    if (!rescheduleEligibility.allowed) {
      return sendError(res, rescheduleEligibility.reason, 400);
    }

    // 6. Validate new date
    const newScheduleDateObj = new Date(scheduledDate);
    newScheduleDateObj.setHours(0, 0, 0, 0);
    if (isNaN(newScheduleDateObj.getTime())) {
      return sendError(res, "Invalid scheduled date format", 400);
    }

    // 7. Prevent past bookings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (newScheduleDateObj < today) {
      return sendError(res, "Cannot reschedule to a past date", 400);
    }

    // 8. Prevent same-day past time bookings
    if (newScheduleDateObj.getTime() === today.getTime()) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;
      if (timeSlot.start < currentTime) {
        return sendError(res, "Cannot reschedule to a past time", 400);
      }
    }

    // 9. Entity-aware eligibility check 
    let scheduleEligibility;
    if (appointment.entityType === "ServiceAgreement") {
      const serviceAgreement = await ServiceAgreement.findById(
        appointment.entityId,
      );
      scheduleEligibility = canScheduleServiceAgreementAppointment(
        serviceAgreement,
        newScheduleDateObj,
      );
    } else {
      // ── EXACT PRE-EXISTING BEHAVIOR ──
      const workOrder = await WorkOrder.findById(
        appointment.workOrder,
      ).populate("dynamicStatus", "name");
      scheduleEligibility = await canScheduleAppointment(
        workOrder,
        newScheduleDateObj,
      );
    }

    if (!scheduleEligibility.allowed) {
      return sendError(res, scheduleEligibility.reason, 400);
    }

    // 10. Save current appointment to history
    if (!appointment.rescheduleHistory) {
      appointment.rescheduleHistory = [];
    }
    appointment.rescheduleHistory.push({
      scheduledDate: appointment.scheduledDate,
      timeSlot: {
        start: appointment.timeSlot.start,
        end: appointment.timeSlot.end,
      },
      rescheduledAt: new Date(),
      rescheduledBy: vendorId,
      reason: reason || "Rescheduled by vendor",
    });

    // 11. Update appointment
    appointment.scheduledDate = newScheduleDateObj;
    appointment.timeSlot = {
      start: timeSlot.start,
      end: timeSlot.end,
    };
    appointment.status = "rescheduled";

    await appointment.save();

    // 12. Populate for response — entity-aware populate path only
    const entityPopulatePath =
      appointment.entityType === "ServiceAgreement" ? "entityId" : "workOrder";
    const entityPopulateSelect =
      appointment.entityType === "ServiceAgreement"
        ? "serviceAgreementNumber description"
        : "workOrderNumber description";

    const updatedAppointment = await WorkOrderAppointment.findById(id)
      .populate(entityPopulatePath, entityPopulateSelect)
      .populate("building", "buildingAbbreviation formData.address")
      .populate("rescheduleHistory.rescheduledBy", "preferredName email");

    return sendSuccess(res, "Appointment rescheduled successfully", {
      appointment: updatedAppointment,
    });
  } catch (err) {
    console.error("Error rescheduling appointment:", err);
    return sendError(
      res,
      err.message || "Failed to reschedule appointment",
      500,
    );
  }
};

/**
 * Cancel appointment
 */
exports.cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const vendorId = req.user._id;

    // 1. Find appointment — building populated generically
    const appointment = await WorkOrderAppointment.findById(id).populate(
      "building",
      "buildingAbbreviation",
    );

    if (!appointment) {
      return sendError(res, "Appointment not found", 404);
    }

    // 2. Vendor authorization
    if (appointment.vendor.toString() !== vendorId.toString()) {
      return sendError(
        res,
        "You are not authorized to cancel this appointment",
        403,
      );
    }

    // 3. Check if appointment can be cancelled
    const cancelEligibility = canCancelAppointment(appointment);
    if (!cancelEligibility.allowed) {
      return sendError(res, cancelEligibility.reason, 400);
    }

    // 4. Additional check: cannot cancel past appointments
    if (isAppointmentInPast(appointment.scheduledDate, appointment.timeSlot)) {
      return sendError(
        res,
        "Cannot cancel a past appointment. You can only cancel upcoming or current appointments.",
        400,
      );
    }

    // 5. Update appointment status
    appointment.status = "cancelled";
    appointment.cancelledAt = new Date();
    appointment.cancelledBy = vendorId;
    appointment.cancellationReason = reason || "Cancelled by vendor";

    await appointment.save();

    // 6. Populate for response — entity-aware populate path only
    const entityPopulatePath =
      appointment.entityType === "ServiceAgreement" ? "entityId" : "workOrder";
    const entityPopulateSelect =
      appointment.entityType === "ServiceAgreement"
        ? "serviceAgreementNumber description"
        : "workOrderNumber description";

    const cancelledAppointment = await WorkOrderAppointment.findById(id)
      .populate(entityPopulatePath, entityPopulateSelect)
      .populate("building", "buildingAbbreviation formData.address")
      .populate("cancelledBy", "preferredName email");

    return sendSuccess(res, "Appointment cancelled successfully", {
      appointment: cancelledAppointment,
    });
  } catch (err) {
    console.error("Error cancelling appointment:", err);
    return sendError(res, err.message || "Failed to cancel appointment", 500);
  }
};

/**
 * Get vendor appointments
 */
exports.getVendorAppointments = async (req, res) => {
  const vendorId = req.user._id;
  const { address, workOrderNumber } = req.query;

  const match = {
    vendor: vendorId,
    status: { $ne: "cancelled" },
  };

  const appointments = await WorkOrderAppointment.aggregate([
    { $match: match },

    {
      $lookup: {
        from: "workorders",
        localField: "entityId",
        foreignField: "_id",
        as: "workOrderLookup",
      },
    },

    {
      $lookup: {
        from: "serviceagreements",
        localField: "entityId",
        foreignField: "_id",
        as: "serviceAgreementLookup",
      },
    },
    {
      $lookup: {
        from: "buildings",
        localField: "building",
        foreignField: "_id",
        as: "building",
      },
    },
    { $unwind: "$building" },
    {
      $addFields: {
        workOrder: { $first: "$workOrderLookup" },
        serviceAgreement: { $first: "$serviceAgreementLookup" },
      },
    },

    {
      $match: {
        $or: [
          { workOrder: { $ne: null } },
          { serviceAgreement: { $ne: null } },
        ],
      },
    },
    { $project: { workOrderLookup: 0, serviceAgreementLookup: 0 } },
    { $sort: { scheduledDate: 1 } },
  ]);

  const filtered = appointments.filter((apt) => {
    const addr =
      apt.building?.formData?.address ||
      apt.building?.formData?.fullAddress ||
      "";
    const number =
      apt.entityType === "ServiceAgreement"
        ? apt.serviceAgreement?.serviceAgreementNumber
        : apt.workOrder?.workOrderNumber;

    const addressMatch = address
      ? addr.toLowerCase().includes(address.toLowerCase())
      : true;
    const numberMatch = workOrderNumber
      ? (number || "").toLowerCase().includes(workOrderNumber.toLowerCase())
      : true;

    return addressMatch && numberMatch;
  });

  const appointmentsWithPermissions = filtered.map((apt) => {
    const isPast = isAppointmentInPast(apt.scheduledDate, apt.timeSlot);
    return {
      ...apt,
      isPast,
      canReschedule:
        !isPast && ["scheduled", "rescheduled"].includes(apt.status),
      canCancel: !isPast && ["scheduled", "rescheduled"].includes(apt.status),
    };
  });

  return sendSuccess(res, "Appointments fetched", {
    appointments: appointmentsWithPermissions,
  });
};

/**
 * Get single appointment details
 */
exports.getAppointmentDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.user._id;

    const raw = await WorkOrderAppointment.findById(id);
    if (!raw) return sendError(res, "Appointment not found", 404);

    const isSA = raw.entityType === "ServiceAgreement";

    const appointment = await WorkOrderAppointment.findById(id)
      .populate(
        isSA ? "entityId" : "workOrder",
        isSA
          ? "serviceAgreementNumber description initialDueDate vendorResponse"
          : "workOrderNumber description dueDate vendorResponse",
      )
      .populate(
        "building",
        "buildingAbbreviation formData.address formData.city",
      )
      .populate("vendor", "companyName technicianName email")
      .populate("createdBy", "preferredName email")
      .populate("cancelledBy", "preferredName email")
      .populate("rescheduleHistory.rescheduledBy", "preferredName email");

    if (!appointment) {
      return sendError(res, "Appointment not found", 404);
    }

    // Vendor authorization
    if (appointment.vendor._id.toString() !== vendorId.toString()) {
      return sendError(
        res,
        "You are not authorized to view this appointment",
        403,
      );
    }

    // Metadata
    const isPast = isAppointmentInPast(
      appointment.scheduledDate,
      appointment.timeSlot,
    );
    const canReschedule =
      !isPast && ["scheduled", "rescheduled"].includes(appointment.status);
    const canCancel =
      !isPast && ["scheduled", "rescheduled"].includes(appointment.status);

    return sendSuccess(res, "Appointment details fetched successfully", {
      appointment: {
        ...appointment.toObject(),
        isPast,
        canReschedule,
        canCancel,
        rescheduleCount: appointment.rescheduleHistory?.length || 0,
      },
    });
  } catch (err) {
    console.error("Error fetching appointment details:", err);
    return sendError(
      res,
      err.message || "Failed to fetch appointment details",
      500,
    );
  }
};

/**
 * Get appointment for a specific work order
 */
exports.getWorkOrderAppointment = async (req, res) => {
  try {
    const { workOrderId } = req.params;
    const vendorId = req.user._id;

    if (!workOrderId) {
      return sendError(res, "Work order ID is required", 400);
    }

    const appointment = await WorkOrderAppointment.findOne({
      workOrder: workOrderId,
      vendor: vendorId,
      status: { $in: ["scheduled", "rescheduled"] },
    })
      .populate("workOrder", "workOrderNumber")
      .populate("building", "buildingAbbreviation formData.address")
      .sort({ createdAt: -1 });

    if (!appointment) {
      return sendError(
        res,
        "No active appointment found for this work order",
        404,
      );
    }

    return sendSuccess(res, "Appointment fetched successfully", {
      appointment,
    });
  } catch (err) {
    console.error("Error fetching work order appointment:", err);
    return sendError(res, err.message || "Failed to fetch appointment", 500);
  }
};
