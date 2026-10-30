const mongoose = require("mongoose");
const Client = require("../models/Client");
const Order = require("../models/Order2");
const CreditNote = require("../models/CreditNote");
const { resolveClientCreditBalance, buildClientCreditBalanceSyncFilter } = require("./clientCreditBalance");
const { recordFinancialRecoveryIssue } = require("./financialRecovery");

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Resolve invoice sales using the same precedence as the sales-analytics
 * endpoint. Legacy orders may have roundOffFinalRevenue persisted as 0 even
 * when finalRevenue or totalAmount contains the real total.
 */
function getInvoiceRevenue(order = {}) {
  const roundedRevenue = Number(order.roundOffFinalRevenue);
  if (Number.isFinite(roundedRevenue) && roundedRevenue > 0) {
    return round2(roundedRevenue);
  }

  // totalAmount is the persisted rounded invoice total in this schema.
  // Prefer it to finalRevenue, which is the pre-rounding calculation.
  const totalAmount = Number(order.totalAmount);
  if (Number.isFinite(totalAmount) && totalAmount > 0) {
    return round2(totalAmount);
  }

  const finalRevenue = Number(order.finalRevenue);
  return Number.isFinite(finalRevenue) && finalRevenue > 0
    ? Math.round(finalRevenue)
    : 0;
}

async function syncClientData(clientId, attempt = 0) {
  if (!clientId || !mongoose.isValidObjectId(clientId)) return null;

  const client = await Client.findById(clientId)
    .select("_id createdBy creditBalance creditBalanceAdjustment +financialSummaryVersion")
    .lean();
  if (!client) return null;

  const currentSummaryVersion = Number(client.financialSummaryVersion);
  const nextSummaryVersion = Number.isFinite(currentSummaryVersion) && currentSummaryVersion >= 0
    ? currentSummaryVersion + 1
    : 1;

  const [orders, creditRows] = await Promise.all([
    Order.find({ clientId: client._id, createdBy: client.createdBy, status: { $ne: "Cancelled" } })
      .select("orderDate createdAt roundOffFinalRevenue finalRevenue totalAmount paidAmount dueAmount subOrders payments")
      .lean(),
    CreditNote.find({ clientId: client._id, createdBy: client.createdBy, status: "Posted" })
      .select("settlement.customerCreditAmount")
      .lean()
  ]);
  const creditState = resolveClientCreditBalance(client, creditRows);
  const { creditBalance, creditBalanceAdjustment } = creditState;

  if (!orders.length) {
    const updated = await Client.findOneAndUpdate(
      buildClientCreditBalanceSyncFilter(client),
      { $set: {
        orderCount: 0, totalRevenue: 0, lastOrderDate: null, totalPaid: 0,
        pendingPayments: 0, outstanding_balance: 0, averageOrderValue: 0,
        preferredProducts: [], orderFrequency: "Occasional", payments: [], paymentHistory: [],
        creditBalance, creditBalanceAdjustment, financialSummaryVersion: nextSummaryVersion
      }},
      { new: true, runValidators: true }
    ).lean();

    if (updated) return updated;
    if (attempt < 2) return syncClientData(clientId, attempt + 1);
    throw new Error("Customer balance changed during summary refresh; retry the refresh.");

  }

  const totalRevenue = round2(orders.reduce((sum, order) => sum + getInvoiceRevenue(order), 0));
  const totalPaid = round2(orders.reduce((s,o)=>s+Number(o.paidAmount||0),0));
  const outstanding = round2(orders.reduce((s,o)=>s+Math.max(0,Number(o.dueAmount||0)),0));

  const counts = new Map();
  for (const order of orders) for (const item of order.subOrders || []) {
    const name=String(item.orderName||item.designNumber||"").trim();
    if(name) counts.set(name,(counts.get(name)||0)+1);
  }
  const preferredProducts=[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,10).map(([x])=>x);

  let orderFrequency="Occasional";
  if(orders.length>=2){
    const dates=orders.map(o=>new Date(o.orderDate||o.createdAt).getTime()).sort((a,b)=>a-b);
    const spanDays=Math.max(1,(dates.at(-1)-dates[0])/86400000);
    const avgDays=spanDays/Math.max(1,dates.length-1);
    orderFrequency=avgDays<=1.5?"Daily":avgDays<=10?"Weekly":avgDays<=45?"Monthly":"Occasional";
  }

  const paymentHistory=orders.flatMap(o=>(o.payments||[]).map(p=>p._id));
  const lastOrderDate=orders.reduce((latest,o)=>{const d=new Date(o.orderDate||o.createdAt);return !latest||d>latest?d:latest;},null);

  const updated = await Client.findOneAndUpdate(
    buildClientCreditBalanceSyncFilter(client),
    { $set: {
      orderCount:orders.length,totalRevenue,lastOrderDate,totalPaid,
      pendingPayments:outstanding,outstanding_balance:outstanding,
      averageOrderValue:round2(totalRevenue/orders.length),preferredProducts,
      orderFrequency,payments:orders.map(o=>o._id),paymentHistory,
      creditBalance,creditBalanceAdjustment,financialSummaryVersion:nextSummaryVersion
    }},
    {new:true,runValidators:true}
  ).lean();

  if (updated) return updated;
  if (attempt < 2) return syncClientData(clientId, attempt + 1);
  throw new Error("Customer balance changed during summary refresh; retry the refresh.");
}

async function syncClientDataSafely(clientId, context = "a saved financial transaction", createdBy = null) {
  try {
    return await syncClientData(clientId);
  } catch (firstError) {
    console.error(`Customer totals refresh failed after ${context}; retrying once.`, firstError);
    try {
      return await syncClientData(clientId);
    } catch (retryError) {
      // The financial transaction is already saved. Never report it as failed:
      // users might retry it and accidentally create a duplicate payment.
      console.error(`Customer totals refresh still failed after ${context}; recording a recovery issue.`, retryError);

      let issueOwner = createdBy;
      if (!mongoose.isValidObjectId(issueOwner)) {
        try {
          const client = await Client.findById(clientId).select("createdBy").lean();
          issueOwner = client?.createdBy;
        } catch (ownerLookupError) {
          console.error("[CUSTOMER_SUMMARY_RECOVERY_OWNER_LOOKUP_FAILED]", ownerLookupError);
        }
      }

      if (mongoose.isValidObjectId(issueOwner)) {
        await recordFinancialRecoveryIssue({
          createdBy: issueOwner,
          operation: "customer-summary-sync",
          summary: "A saved transaction is complete, but customer totals could not be refreshed automatically. Refresh customer totals before relying on this customer's balance.",
          originalError: retryError,
          clientIds: [clientId],
          recoveryFailures: [{
            step: "refresh-customer-financial-summary",
            entityType: "client",
            entityId: String(clientId),
            message: retryError?.message || "Customer totals refresh failed after the automatic retries."
          }]
        });
      } else {
        console.error("[CUSTOMER_SUMMARY_RECOVERY_OWNER_UNAVAILABLE]", JSON.stringify({
          clientId: String(clientId || ""),
          context: String(context || "")
        }));
      }

      return null;
    }
  }
}

module.exports={syncClientData,syncClientDataSafely,getInvoiceRevenue};
