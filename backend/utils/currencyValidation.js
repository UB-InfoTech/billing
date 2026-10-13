function toCurrencyCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    throw new TypeError("Currency amount must be a finite number.");
  }
  return Math.round(amount * 100);
}

function exceedsCurrencyLimit(amount, limit) {
  return toCurrencyCents(amount) > toCurrencyCents(limit);
}

function meetsCurrencyTarget(amount, target) {
  return toCurrencyCents(amount) >= toCurrencyCents(target);
}

module.exports = {
  toCurrencyCents,
  exceedsCurrencyLimit,
  meetsCurrencyTarget,
};
