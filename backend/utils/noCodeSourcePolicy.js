function isNoCodeSourceSafe(model, userModel) {
  // User accounts are global login records rather than workspace-owned
  // resources. They are safe only when the lookup is restricted to the
  // currently authenticated account. Every other source must have workspace
  // ownership recorded on its schema before it is exposed to a lookup.
  return model === userModel || Boolean(model?.schema?.path?.("createdBy"));
}

function buildNoCodeSourceQuery(model, ownerId, userModel) {
  if (model === userModel) return { _id: ownerId };
  if (model?.schema?.path?.("createdBy")) return { createdBy: ownerId };
  return null;
}

function getNoCodeSourceProjection(source, model) {
  const fields = Array.isArray(source?.fields) ? source.fields : [];
  return [...new Set(fields
    .map(([field]) => field)
    .filter(field => typeof field === "string" && model?.schema?.path?.(field)))];
}

module.exports = {
  isNoCodeSourceSafe,
  buildNoCodeSourceQuery,
  getNoCodeSourceProjection,
};
