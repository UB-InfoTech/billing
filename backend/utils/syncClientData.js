const mongoose = require("mongoose");
const Client = require("../models/Client");
const Order = require("../models/Order2");
const CreditNote = require("../models/CreditNote");

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

async function syncClientData(clientId) {
  if (!clientId || !mongoose.isValidObjectId(clientId)) return null;

  const orders = await Order.find({ clientId, status: { $ne: "Cancelled" } })
    .select("orderDate createdAt roundOffFinalRevenue finalRevenue paidAmount dueAmount subOrders payments")
    .lean();

  if (!orders.length) {
    return Client.findByIdAndUpdate(clientId, { $set: {
      orderCount: 0, totalRevenue: 0, lastOrderDate: null, totalPaid: 0,
      pendingPayments: 0, outstanding_balance: 0, averageOrderValue: 0,
      preferredProducts: [], orderFrequency: "Occasional", payments: [], paymentHistory: []
    }}, { new: true }).lean();
  }

  const totalRevenue = round2(orders.reduce((s,o)=>s+Number(o.roundOffFinalRevenue ?? o.finalRevenue ?? 0),0));
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

  const creditRows=await CreditNote.find({clientId,status:"Posted"}).select("settlement.customerCreditAmount").lean();
  const creditBalance=round2(creditRows.reduce((s,n)=>s+Number(n.settlement?.customerCreditAmount||0),0));

  return Client.findByIdAndUpdate(clientId, {$set:{
    orderCount:orders.length,totalRevenue,lastOrderDate,totalPaid,
    pendingPayments:outstanding,outstanding_balance:outstanding,
    averageOrderValue:round2(totalRevenue/orders.length),preferredProducts,
    orderFrequency,payments:orders.map(o=>o._id),paymentHistory,creditBalance
  }},{new:true}).lean();
}

module.exports={syncClientData};
