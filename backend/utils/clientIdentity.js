function hasClientIdentity(client = {}) {
  return [client.companyName, client.name].some(value => String(value ?? "").trim().length > 0);
}

function assertClientIdentity(client = {}) {
  if (!hasClientIdentity(client)) {
    const error = new Error("Add a customer/business name or a contact name before saving.");
    error.status = 400;
    throw error;
  }
  return true;
}

module.exports = { hasClientIdentity, assertClientIdentity };
