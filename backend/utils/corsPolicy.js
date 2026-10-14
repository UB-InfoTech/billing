const DEVELOPMENT_ORIGINS = Object.freeze([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174"
]);

function getCorsPolicy({
  nodeEnv = process.env.NODE_ENV,
  frontendUrls = process.env.FRONTEND_URLS,
  frontendUrl = process.env.FRONTEND_URL
} = {}) {
  const isProduction = nodeEnv === "production";
  const rawOrigins = String(frontendUrls || frontendUrl || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);
  const hasWildcard = rawOrigins.includes("*");
  const configuredOrigins = [...new Set(rawOrigins.filter(origin => origin !== "*"))];

  let configurationError = "";
  if (isProduction && (!configuredOrigins.length || hasWildcard)) {
    configurationError =
      "In production, set FRONTEND_URLS to one or more exact frontend origins. Wildcard origins are not allowed.";
  }

  return {
    isProduction,
    allowedOrigins: configuredOrigins.length
      ? configuredOrigins
      : isProduction
        ? []
        : [...DEVELOPMENT_ORIGINS],
    configurationError
  };
}

function isCorsOriginAllowed(origin, allowedOrigins) {
  // Non-browser clients such as health checks and server-to-server requests
  // do not send an Origin header and do not need browser CORS permission.
  return !origin || allowedOrigins.includes(origin);
}

module.exports = {
  DEVELOPMENT_ORIGINS,
  getCorsPolicy,
  isCorsOriginAllowed
};
