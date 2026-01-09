/**
 * Determines if a work order is eligible for appointment scheduling
 */
exports.canScheduleAppointment = (workOrder, scheduledDate) => {
  // Rule 0: Vendor must have accepted the work order
  if (workOrder.vendorResponse !== "accepted") {
    return {
      allowed: false,
      reason:
        "You must accept this work order before scheduling an appointment",
    };
  }

  // Rule 1: Primary status closed → BLOCK
  if (workOrder.status === "closed") {
    return {
      allowed: false,
      reason: "Cannot schedule appointment for a closed work order",
    };
  }

  // Rule 2: Dynamic status Completed / Declined → BLOCK
  const dynName = workOrder.dynamicStatus?.name;
  if (["Completed", "Declined"].includes(dynName)) {
    return {
      allowed: false,
      reason: `Cannot schedule appointment for a ${dynName.toLowerCase()} work order`,
    };
  }

  // Rule 3: Due date + 7 days grace window
  if (workOrder.dueDate) {
    const graceEndDate = new Date(workOrder.dueDate);
    graceEndDate.setDate(graceEndDate.getDate() + 7);
    graceEndDate.setHours(23, 59, 59, 999);

    if (scheduledDate > graceEndDate) {
      return {
        allowed: false,
        reason:
          "Appointment can only be scheduled up to 7 days after the work order due date",
      };
    }
  }

  return { allowed: true };
};

/**
 * Check if an appointment can be rescheduled
 */
exports.canRescheduleAppointment = (appointment) => {
  // Rule 1: Cannot reschedule cancelled or completed appointments
  if (["cancelled", "completed"].includes(appointment.status)) {
    return {
      allowed: false,
      reason: `Cannot reschedule a ${appointment.status} appointment`,
    };
  }

  // Rule 2: Check if appointment date is in the past
  const appointmentDateTime = new Date(appointment.scheduledDate);
  const [hours, minutes] = appointment.timeSlot.start.split(":");
  appointmentDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

  const now = new Date();

  if (appointmentDateTime < now) {
    return {
      allowed: false,
      reason: "Cannot reschedule a past appointment",
    };
  }

  // Rule 3: Limit number of reschedules (optional business rule)
  const MAX_RESCHEDULES = 3;
  if (appointment.rescheduleHistory?.length >= MAX_RESCHEDULES) {
    return {
      allowed: false,
      reason: `Maximum reschedule limit (${MAX_RESCHEDULES}) reached. Please contact support.`,
    };
  }

  return { allowed: true };
};

/**
 * Check if an appointment can be cancelled
 */
exports.canCancelAppointment = (appointment) => {
  // Rule 1: Cannot cancel already cancelled or completed appointments
  if (["cancelled", "completed"].includes(appointment.status)) {
    return {
      allowed: false,
      reason: `Cannot cancel a ${appointment.status} appointment`,
    };
  }

  // Rule 2: Can only cancel upcoming or present appointments (not past)
  const appointmentDateTime = new Date(appointment.scheduledDate);
  const [hours, minutes] = appointment.timeSlot.start.split(":");
  appointmentDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

  const now = new Date();

  if (appointmentDateTime < now) {
    return {
      allowed: false,
      reason: "Cannot cancel a past appointment",
    };
  }

  return { allowed: true };
};

/**
 * Helper to check if date/time is in the past
 */
exports.isAppointmentInPast = (scheduledDate, timeSlot) => {
  const appointmentDateTime = new Date(scheduledDate);
  const [hours, minutes] = timeSlot.start.split(":");
  appointmentDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

  return appointmentDateTime < new Date();
};
