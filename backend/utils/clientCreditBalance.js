const round2 = value =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

function sumCustomerCredit(notes = []) {
  const total = (Array.isArray(notes) ? notes : []).reduce((sum, note) => {
    const amount = Number(note?.settlement?.customerCreditAmount ?? 0);
    return sum + (Number.isFinite(amount) ? Math.max(0, amount) : 0);
  }, 0);
  return round2(total);
}

/**
 * Resolve the client's spendable credit from posted Credit Notes plus manual
 * balance adjustments. For legacy records without creditBalanceAdjustment,
 * infer the adjustment from the balance already stored so existing balances
 * are preserved during the first sync after deployment.
 */
function resolveClientCreditBalance(client = {}, creditNotes = []) {
  const noteCreditTotal = sumCustomerCredit(creditNotes);
  const hasAdjustment = Object.prototype.hasOwnProperty.call(client, "creditBalanceAdjustment")
    && client.creditBalanceAdjustment !== undefined
    && client.creditBalanceAdjustment !== null
    && Number.isFinite(Number(client.creditBalanceAdjustment));
  const creditBalanceAdjustment = hasAdjustment
    ? round2(client.creditBalanceAdjustment)
    : round2(Number(client.creditBalance || 0) - noteCreditTotal);
  return {
    creditNoteTotal: noteCreditTotal,
    creditBalanceAdjustment,
    creditBalance: Math.max(0, round2(creditBalanceAdjustment + noteCreditTotal))
  };
}

/**
 * Apply a manual adjustment without making the amount disappear on the next
 * customer-summary refresh.
 */
/**
 * Match the balance fields used to derive a sync result. This optimistic
 * filter prevents a summary refresh from overwriting a concurrent payment,
 * Credit Note, or manual credit adjustment.
 */
function buildClientCreditBalanceSyncFilter(client = {}) {
  const filter = {
    _id: client._id,
    createdBy: client.createdBy
  };
  const clauses = [];

  if (client.creditBalance === undefined || client.creditBalance === null) {
    clauses.push({
      $or: [
        { creditBalance: { $exists: false } },
        { creditBalance: null },
        { creditBalance: 0 }
      ]
    });
  } else {
    filter.creditBalance = client.creditBalance;
  }

  const hasAdjustment = Object.prototype.hasOwnProperty.call(client, "creditBalanceAdjustment")
    && client.creditBalanceAdjustment !== undefined
    && client.creditBalanceAdjustment !== null
    && Number.isFinite(Number(client.creditBalanceAdjustment));

  if (hasAdjustment) {
    filter.creditBalanceAdjustment = client.creditBalanceAdjustment;
  } else {
    clauses.push({
      $or: [
        { creditBalanceAdjustment: { $exists: false } },
        { creditBalanceAdjustment: null }
      ]
    });
  }

  if (clauses.length) filter.$and = clauses;
  return filter;
}

function applyManualCreditAdjustment(currentBalance, creditNotes, amount) {
  const current = Number(currentBalance);
  const adjustment = Number(amount);
  if (!Number.isFinite(current) || current < 0) {
    throw new Error("The current customer credit balance is invalid.");
  }
  if (!Number.isFinite(adjustment) || adjustment === 0) {
    throw new Error("A non-zero credit adjustment is required.");
  }
  const nextBalance = round2(current + adjustment);
  if (nextBalance < 0) {
    throw new Error("Credit balance cannot become negative.");
  }
  const noteCreditTotal = sumCustomerCredit(creditNotes);
  return {
    creditBalance: nextBalance,
    creditBalanceAdjustment: round2(nextBalance - noteCreditTotal)
  };
}

module.exports = {
  round2,
  sumCustomerCredit,
  resolveClientCreditBalance,
  applyManualCreditAdjustment,
  buildClientCreditBalanceSyncFilter
};
