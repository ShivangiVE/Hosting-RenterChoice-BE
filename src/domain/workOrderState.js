const WODynamicStatus = require("../models/WODynamicStatus");

async function completeWorkOrder(
  workOrder,
  { invoiceUploaded, keyReturnOption, validateKey = true }
) {
  const completedStatus = await WODynamicStatus.findOne({ name: "Completed" });
  if (!completedStatus) {
    throw new Error("Completed status missing");
  }

  if (validateKey && workOrder.keyIssued === true) {
    if (!keyReturnOption) {
      throw new Error(
        "Key return selection is mandatory because a key was issued"
      );
    }

    if (!["returned_now", "return_later"].includes(keyReturnOption)) {
      throw new Error("Invalid key return option");
    }

    if (keyReturnOption === "returned_now") {
      workOrder.keyIssued = false;
      workOrder.keyReturnStatus = "Returned";
    }

    if (keyReturnOption === "return_later") {
      workOrder.keyReturnStatus = "Return Later";
    }
  }

  workOrder.dynamicStatus = completedStatus._id;
  workOrder.completeDate = new Date();

  if (invoiceUploaded) {
    workOrder.invoiceUploaded = true;
    workOrder.invoicePending = false;
    workOrder.status = "closed";
  } else {
    workOrder.invoiceUploaded = false;
    workOrder.invoicePending = true;
    workOrder.status = "open";
  }
}

module.exports = { completeWorkOrder };
