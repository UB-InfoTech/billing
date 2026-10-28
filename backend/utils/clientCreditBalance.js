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
 * Resolve spendable credit from posted Credit Notes plus manual adjustments.
 * Legacy customers without creditBalanceAdjustment keep their stored balance;
 * the manual component is inferred on first mutation/sync.
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
 * Build one compare-and-set mutation for a customer's credit balance.
 *
 * A Credit Note changes creditBalance, but not the independent manual
 * adjustment. A manual adjustment changes both by the same amount. The
 * customer's summary revision is advanced in the same write so a concurrent
 * summary refresh or another balance mutation must re-read its inputs.
 *
 * Pass a lean customer snapshot with financialSummaryVersion explicitly
 * selected, and the currently posted Credit Notes for that customer.
 */
function buildClientCreditBalanceMutation({
  client = {},
  creditNotes = [],
  amount,
  adjustmentDelta = 0,
  minimumBalance = 0,
  insufficientBalanceMessage
} = {}) {
  if (!client._id || !client.createdBy) {
    throw new Error("Customer balance mutation requires a valid customer.");
  }

  const currentBalance = Number(client.creditBalance ?? 0);
  const delta = Number(amount);
  const adjustmentChange = Number(adjustmentDelta);
  const minimum = Number(minimumBalance);

  if (!Number.isFinite(currentBalance) || currentBalance < 0) {
    throw new Error("The current customer credit balance is invalid.");
  }
  if (!Number.isFinite(delta) || !Number.isFinite(adjustmentChange)) {
    throw new Error("A valid customer credit amount is required.");
  }
  if (!Number.isFinite(minimum) || minimum < 0) {
    throw new Error("The required customer credit balance is invalid.");
  }
  if (currentBalance + 0.000001 < minimum) {
    throw new Error(insufficientBalanceMessage || "The customer does not have enough available credit.");
  }

  const nextBalance = round2(currentBalance + delta);
  if (nextBalance < 0) {
    throw new Error("Credit balance cannot become negative.");
  }

  const currentState = resolveClientCreditBalance(client, creditNotes);
  const nextAdjustment = round2(currentState.creditBalanceAdjustment + adjustmentChange);
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

  const hasSummaryVersion = client.financialSummaryVersion !== undefined
    && client.financialSummaryVersion !== null
    && Number.isFinite(Number(client.financialSummaryVersion));
  if (hasSummaryVersion) {
    filter.financialSummaryVersion = Number(client.financialSummaryVersion);
  } else {
    clauses.push({
      $or: [
        { financialSummaryVersion: { $exists: false } },
        { financialSummaryVersion: null },
        { financialSummaryVersion: 0 }
      ]
    });
  }

  if (clauses.length) filter.$and = clauses;

  return {
    filter,
    update: {
      $inc: {
        creditBalance: round2(delta),
        financialSummaryVersion: 1
      },
      $set: {
        creditBalanceAdjustment: nextAdjustment
      }
    },
    currentBalance,
    nextBalance,
    creditBalanceAdjustment: nextAdjustment
  };
}

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

  const hasSummaryVersion = client.financialSummaryVersion !== undefined
    && client.financialSummaryVersion !== null
    && Number.isFinite(Number(client.financialSummaryVersion));
  if (hasSummaryVersion) {
    filter.financialSummaryVersion = Number(client.financialSummaryVersion);
  } else {
    clauses.push({
      $or: [
        { financialSummaryVersion: { $exists: false } },
        { financialSummaryVersion: null },
        { financialSummaryVersion: 0 }
      ]
    });
  }

  if (clauses.length) filter.$and = clauses;
  return filter;
}

/**
 * Apply a manual adjustment without making it disappear on the next summary
 * refresh. When an adjustment has already been materialized, adjust that
 * component directly instead of deriving it from potentially changing note
 * rows.
 */
function applyManualCreditAdjustment(currentBalance, creditNotes, amount, currentAdjustment) {
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

  const hasAdjustment = currentAdjustment !== undefined
    && currentAdjustment !== null
    && Number.isFinite(Number(currentAdjustment));
  const currentManualComponent = hasAdjustment
    ? round2(currentAdjustment)
    : round2(current - sumCustomerCredit(creditNotes));

  return {
    creditBalance: nextBalance,
    creditBalanceAdjustment: round2(currentManualComponent + adjustment)
  };
}

module.exports = {
  round2,
  sumCustomerCredit,
  resolveClientCreditBalance,
  buildClientCreditBalanceMutation,
  applyManualCreditAdjustment,
  buildClientCreditBalanceSyncFilter
};
