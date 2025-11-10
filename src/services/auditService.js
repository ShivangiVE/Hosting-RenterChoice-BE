const Audit = require("../models/Audit");


class AuditService {
  static async logActivity({
    entityType,
    entityId,
    action,
    actionDetails,
    changes = [],
    performedBy,
    ipAddress = '',
    userAgent = ''
  }) {
    try {
      const audit = new Audit({
        entityType,
        entityId,
        action,
        actionDetails,
        changes,
        performedBy,
        ipAddress,
        userAgent,
        timestamp: new Date()
      });

      await audit.save();
      return audit;
    } catch (error) {
      console.error('Audit logging failed:', error);
      // Don't throw error to avoid breaking main functionality
    }
  }

  static async getAuditTrail({
    entityType,
    entityId,
    page = 1,
    limit = 10,
    startDate,
    endDate,
    action
  }) {
    try {
      const query = {};
      
      if (entityType) query.entityType = entityType;
      if (entityId) query.entityId = entityId;
      if (action) query.action = action;
      
      // Date range filter
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      const skip = (page - 1) * limit;

      const [audits, total] = await Promise.all([
        Audit.find(query)
          .populate('performedBy', 'preferredName email firstName lastName')
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Audit.countDocuments(query)
      ]);

      return {
        audits,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      throw new Error(`Failed to fetch audit trail: ${error.message}`);
    }
  }
}

module.exports = AuditService;