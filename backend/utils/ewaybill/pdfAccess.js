function validateRequestedEwayBill(order, requestedEwbNo) {
  const requested = String(requestedEwbNo ?? "").trim();
  const saved = String(order?.ewbDetails?.ewbNo ?? "").trim();

  if (!requested || !saved || requested !== saved) {
    const error = new Error("This E-Way Bill does not belong to the selected invoice.");
    error.status = 404;
    throw error;
  }

  return requested;
}

module.exports = { validateRequestedEwayBill };
