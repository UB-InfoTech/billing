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

module.exports = { ratio, pct, isProvidedFiniteNumber };
