const Building = require("../models/Building");
const User = require("../models/User");
const resolveTeamUserIds = require("../utils/resolveTeamUserIds");
const { createNotification } = require("./notificationService");
const { OWNER_REQUEST_REVIEWER_ROLES } = require("../constants/roles");

async function findOwnerRequestReviewers(buildingId) {
  const building = await Building.findById(buildingId)
    .select("createdBy")
    .lean();

  const creator = building?.createdBy
    ? await User.findById(building.createdBy)
        .select("_id role team createdBy managedBy")
        .lean()
    : null;

  // null = Admin-created building (no team limit)
  const teamUserIds = creator ? await resolveTeamUserIds(creator) : null;

  const query = { role: { $in: OWNER_REQUEST_REVIEWER_ROLES }, isActive: true };
  if (Array.isArray(teamUserIds)) query._id = { $in: teamUserIds };

  return User.find(query).select("_id role").lean();
}

async function notifyOwnerRequestReviewers(workOrder) {
  const reviewers = await findOwnerRequestReviewers(workOrder.building);

  if (!reviewers.length) {
    console.warn(
      `No reviewers found for owner request ${workOrder.workOrderNumber}`,
    );
    return;
  }

  const results = await Promise.allSettled(
    reviewers.map((r) =>
      createNotification({
        user: r._id,
        role: r.role,
        type: "OWNER_REQUEST_SUBMITTED",
        title: "New Owner Repair Request",
        message: `${workOrder.workOrderNumber} was submitted by an owner and needs your approval.`,
        entityType: "WorkOrder",
        entityId: workOrder._id,
        metadata: {
          workOrderNumber: workOrder.workOrderNumber,
          source: "owner",
        },
      }),
    ),
  );

  // allSettled never throws — make failures visible in the logs
  results
    .filter((r) => r.status === "rejected")
    .forEach((r) =>
      console.error(
        "Owner request notification failed:",
        r.reason?.message || r.reason,
      ),
    );
}

module.exports = { notifyOwnerRequestReviewers };
