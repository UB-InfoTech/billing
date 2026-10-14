const { parseDateOnly } = require("./orderDateRange");

const round2 = value =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const isProvidedFiniteNumber = value =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value));

function ratio(numerator, denominator) {
  if (
    !isProvidedFiniteNumber(numerator) ||
    !isProvidedFiniteNumber(denominator) ||
    Number(denominator) === 0
  ) {
    return null;
  }
  return round2(Number(numerator) / Number(denominator));
}

function pct(numerator, denominator) {
  if (
    !isProvidedFiniteNumber(numerator) ||
    !isProvidedFiniteNumber(denominator) ||
    Number(denominator) === 0
  ) {
    return null;
  }
  return round2(Number(numerator) * 100 / Number(denominator));
}

function getPeriodDayCount(startValue, endValue, now = new Date()) {
  const start = parseDateOnly(startValue, "start");
  const end = parseDateOnly(endValue, "end");
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let effectiveStart;
  let effectiveEnd;
  if (start) {
    effectiveStart = start;
    effectiveEnd = end || today;
  } else {
    effectiveEnd = end || today;
    effectiveStart = new Date(
      effectiveEnd.getFullYear(),
      effectiveEnd.getMonth(),
      effectiveEnd.getDate()
    );
    effectiveStart.setDate(effectiveStart.getDate() - 364);
  }

  const utcDay = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(1, Math.floor((utcDay(effectiveEnd) - utcDay(effectiveStart)) / 86400000) + 1);
}

module.exports = { ratio, pct, isProvidedFiniteNumber, getPeriodDayCount };
