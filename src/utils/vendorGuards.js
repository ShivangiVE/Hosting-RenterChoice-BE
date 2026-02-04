exports.assertVendorAccepted = (workOrder) => {
  if (workOrder.vendorResponse !== "accepted") {
    const err = new Error(
      "Work order must be accepted before performing this action",
    );
    err.statusCode = 403;
    throw err;
  }
};
