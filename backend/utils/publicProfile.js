/**
 * Shape profile data for the browser. E-Way Bill credentials are used only by
 * the server and must never be echoed in API responses.
 */
function toPublicProfile(profile) {
  if (!profile) return profile;

  const value = typeof profile.toObject === "function"
    ? profile.toObject()
    : { ...profile };

  const hasEWayPassword = Boolean(value.eWayPassword);
  delete value.eWayPassword;

  return {
    ...value,
    eWayPassword: "",
    hasEWayPassword
  };
}

module.exports = { toPublicProfile };
