/**
 * Chat policy based on:
 * - Work order status
 * - Participants roles
 */
const canSendMessage = ({ senderRole, receiverRoles, workOrderStatus }) => {
  // No work order → always allow
  if (!workOrderStatus) return true;

  // Work order is OPEN → allow all valid chats
  if (workOrderStatus === "open") return true;

  // Work order is CLOSED
  if (workOrderStatus === "closed") {
    // 🚨 Tenant chat blocked
    if (receiverRoles.includes("Tenant")) return false;

    //  RC chat allowed
    if (receiverRoles.includes("RepairsTeam")) return true;
  }

  return false;
};

module.exports = { canSendMessage };
