const { getVendorEntityConfig } = require("./vendorEntityRegistry");

exports.assertVendorAccepted = (workOrder) => {
  if (workOrder.vendorResponse !== "accepted") {
    const err = new Error(
      "Work order must be accepted before performing this action",
    );
    err.statusCode = 403;
    throw err;
  }
};


exports.assertVendorCanAccessDocument = async (document, userId) => {
  const isOwner = document.uploadedBy?.toString() === userId.toString();

  const isVendorWorkOrder =
    document.workOrder &&
    document.workOrder.vendor &&
    document.workOrder.vendor.toString() === userId.toString();

  let isVendorEntity = isVendorWorkOrder;
  if (!isVendorEntity && document.sourceType && document.sourceId) {
    const config = getVendorEntityConfig(document.sourceType);
    if (config) {
      const entity = await config.model
        .findById(document.sourceId)
        .select("vendor");
      isVendorEntity = entity?.vendor?.toString() === userId.toString();
    }
  }

  if (!isOwner && !isVendorEntity) {
    const err = new Error("You do not have access to this document");
    err.statusCode = 403;
    throw err;
  }
};
