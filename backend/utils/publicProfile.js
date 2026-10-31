/**
 * Shape profile data for the browser. E-Way Bill credentials are used only by
 * the server and must never be echoed in API responses.
 */
function toPublicProfile(profile) {
  if (!profile) return profile;

  const value = typeof profile.toObject === "function"
    ? profile.toObject({flattenMaps:true})
    : { ...profile };

  // Mongoose Maps must be flattened before JSON serialization, otherwise
  // custom profile values can disappear from the API response.
  if(value.customFields instanceof Map
    ||value.customFields?.$isMongooseMap===true
    ||(typeof value.customFields?.entries==="function"&&typeof value.customFields?.get==="function")){
    value.customFields=Object.fromEntries(value.customFields.entries());
  }

  const hasEWayPassword = Boolean(value.eWayPassword);
  delete value.eWayPassword;

  return {
    ...value,
    eWayPassword: "",
    hasEWayPassword
  };
}

module.exports = { toPublicProfile };
