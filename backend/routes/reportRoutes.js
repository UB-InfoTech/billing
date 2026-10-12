const express=require("express");
const mongoose=require("mongoose");
const htmlPdf=require("html-pdf");
const nodemailer=require("nodemailer");
const Order=require("../models/Order2");
const Client=require("../models/Client");
const Expense=require("../models/Expense");
const Machine=require("../models/Machine");
const Supplier=require("../models/Supplier");
const CreditNote=require("../models/CreditNote");
const auth=require("../middleware/auth");
const {getInvoiceRevenue}=require("../utils/syncClientData");
const router=express.Router();
const round2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;
const owner=req=>req.user.id;
const {buildOrderDateRange}=require("../utils/orderDateRange");

function dateRange(start,end){return buildOrderDateRange({startDate:start,endDate:end});}
function period(req){const start=req.query.startDate||req.query.from;const end=req.query.endDate||req.query.to;return dateRange(start,end);}
function invoiceRevenueExpression() {
  const rounded = { $ifNull: ["$roundOffFinalRevenue", 0] };
  const total = { $ifNull: ["$totalAmount", 0] };
  const final = { $ifNull: ["$finalRevenue", 0] };
  return {
    $cond: [
      { $gt: [rounded, 0] },
      rounded,
      {
        $cond: [
          { $gt: [total, 0] },
          total,
          { $floor: { $add: [{ $max: [final, 0] }, 0.5] } }
        ]
      }
    ]
  };
}

router.get("/sales-summary",auth,async(req,res)=>{
  try{
    const range=period(req),match={createdBy:new mongoose.Types.ObjectId(owner(req)),status:{$ne:"Cancelled"}};if(range)match.orderDate=range;
    const groupDate=req.query.timeframe==="monthly"?{$dateToString:{format:"%Y-%m",date:"$orderDate"}}:req.query.timeframe==="yearly"?{$dateToString:{format:"%Y",date:"$orderDate"}}:{$dateToString:{format:"%Y-%m-%d",date:"$orderDate"}};
    const data=await Order.aggregate([{$match:match},{$group:{_id:groupDate,revenue:{$sum:invoiceRevenueExpression()},orders:{$sum:1},paid:{$sum:"$paidAmount"},due:{$sum:"$dueAmount"}}},{$sort:{_id:1}}]);
    res.json(data.map(x=>({...x,totalRevenue:round2(x.revenue),revenue:round2(x.revenue),paid:round2(x.paid),due:round2(x.due)})));
  }catch(error){res.status(error.status||500).json({message:error.message});}
});

router.get("/sales-report",auth,async(req,res)=>{
  try{
    const range=period(req),match={createdBy:new mongoose.Types.ObjectId(owner(req)),status:{$ne:"Cancelled"}};if(range)match.orderDate=range;
    const salesData=await Order.aggregate([{$match:match},{$group:{_id:{$dateToString:{format:"%Y-%m-%d",date:"$orderDate"}},totalRevenue:{$sum:invoiceRevenueExpression()},orderCount:{$sum:1},paid:{$sum:"$paidAmount"},due:{$sum:"$dueAmount"}}},{$sort:{_id:1}}]);
    const total=salesData.reduce((s,x)=>s+Number(x.totalRevenue||0),0),orders=salesData.reduce((s,x)=>s+Number(x.orderCount||0),0);
    res.json({success:true,salesData:salesData.map(x=>({...x,totalRevenue:round2(x.totalRevenue),paid:round2(x.paid),due:round2(x.due)})),summary:{totalRevenue:round2(total),orderCount:orders,averageOrderValue:orders?round2(total/orders):0}});
  }catch(error){res.status(error.status||500).json({success:false,message:error.message});}
});

router.get("/client-revenue",auth,async(req,res)=>{
  try{
    const range=period(req),match={createdBy:new mongoose.Types.ObjectId(owner(req)),status:{$ne:"Cancelled"}};if(range)match.orderDate=range;
    const rows=await Order.aggregate([{$match:match},{$group:{_id:"$clientId",totalRevenue:{$sum:invoiceRevenueExpression()},orderCount:{$sum:1},paid:{$sum:"$paidAmount"},due:{$sum:"$dueAmount"}}},{$lookup:{from:"clients",localField:"_id",foreignField:"_id",as:"client"}},{$unwind:{path:"$client",preserveNullAndEmptyArrays:true}},{$sort:{totalRevenue:-1}}]);
    res.json(rows.map(x=>({clientId:x._id,clientName:x.client?.companyName||x.client?.name||"Walk-in",totalRevenue:round2(x.totalRevenue),orderCount:x.orderCount,paid:round2(x.paid),due:round2(x.due)})));
  }catch(error){res.status(error.status||500).json({message:error.message});}
});

router.get("/top-selling-sarees",auth,async(req,res)=>{
  try{
    // Keep this calculation in sync with the invoice model: MTR lines bill
    // MTR minus short pieces, while PCS lines bill quantity minus short pieces.
    const rawQuantity={
      $cond:[
        {$eq:[{$ifNull:["$subOrders.qtyUnit","PCS"]},"MTR"]},
        {$ifNull:["$subOrders.MTR",0]},
        {$ifNull:["$subOrders.quantity",0]}
      ]
    };
    const billableQuantity={
      $max:[{$subtract:[rawQuantity,{$ifNull:["$subOrders.shortPcs",0]}]},0]
    };
    const rows=await Order.aggregate([
      {$match:{createdBy:new mongoose.Types.ObjectId(owner(req)),status:{$ne:"Cancelled"}}},
      {$unwind:"$subOrders"},
      {$group:{
        _id:{
          name:"$subOrders.orderName",
          design:"$subOrders.designNumber",
          unit:{$ifNull:["$subOrders.qtyUnit","PCS"]}
        },
        quantity:{$sum:billableQuantity},
        revenue:{$sum:{$multiply:[billableQuantity,{$ifNull:["$subOrders.unitPrice",0]}]}}
      }},
      {$sort:{revenue:-1,quantity:-1}},
      {$limit:20}
    ]);
    res.json(rows.map(x=>({
      name:x._id?.name||"Unnamed",
      designNumber:x._id?.design||"",
      qtyUnit:x._id?.unit||"PCS",
      quantity:round2(Math.max(0,x.quantity)),
      revenue:round2(Math.max(0,x.revenue))
    })));
  }catch(error){res.status(error.status||500).json({message:error.message});}
});

router.get("/machine-performance",auth,async(req,res)=>{try{res.json(await Machine.find({createdBy:owner(req)}).sort({totalRevenueGenerated:-1}).lean());}catch(error){res.status(error.status||500).json({message:error.message});}});
router.get("/supplier-performance",auth,async(req,res)=>{try{res.json({success:true,supplierData:await Supplier.find({createdBy:owner(req)}).sort({name:1}).lean()});}catch(error){res.status(error.status||500).json({success:false,message:error.message});}});

router.get("/profit-analysis",auth,async(req,res)=>{
  try{
    const range=period(req),om={createdBy:new mongoose.Types.ObjectId(owner(req)),status:{$ne:"Cancelled"}};if(range)om.orderDate=range;
    const orders=await Order.find(om).select("orderNumber orderDate companyName roundOffFinalRevenue finalRevenue totalAmount netProfit").lean();
    const orderIds=orders.map(x=>x._id);
    const expenses=await Expense.aggregate([{$match:{createdBy:new mongoose.Types.ObjectId(owner(req)),orderId:{$in:orderIds}}},{$group:{_id:"$orderId",cost:{$sum:"$amount"}}}]);
    const costMap=new Map(expenses.map(x=>[String(x._id),Number(x.cost||0)]));
    const rows=orders.map(o=>{const revenue=getInvoiceRevenue(o),cost=costMap.get(String(o._id))||0,profit=Number.isFinite(Number(o.netProfit))&&Number(o.netProfit)!==0?Number(o.netProfit):revenue-cost;return{orderId:o._id,orderNumber:o.orderNumber,orderDate:o.orderDate,clientName:o.companyName,revenue:round2(revenue),cost:round2(cost),netProfit:round2(profit)};});
    res.json({rows,summary:{revenue:round2(rows.reduce((s,x)=>s+x.revenue,0)),cost:round2(rows.reduce((s,x)=>s+x.cost,0)),netProfit:round2(rows.reduce((s,x)=>s+x.netProfit,0))}});
  }catch(error){res.status(error.status||500).json({message:error.message});}
});

router.get("/expense-vs-profit",auth,async(req,res)=>{
  try{
    const range=period(req);const em={createdBy:owner(req)},om={createdBy:owner(req),status:{$ne:"Cancelled"}};if(range){em.date=range;om.orderDate=range;}
    const [expense,revenue]=await Promise.all([Expense.aggregate([{$match:em},{$group:{_id:null,total:{$sum:"$amount"}}}]),Order.aggregate([{$match:om},{$group:{_id:null,total:{$sum:invoiceRevenueExpression()}}}])]);
    const totalExpense=round2(expense[0]?.total),totalRevenue=round2(revenue[0]?.total);res.json({totalExpense,totalRevenue,profit:round2(totalRevenue-totalExpense),margin:totalRevenue?round2((totalRevenue-totalExpense)*100/totalRevenue):0});
  }catch(error){res.status(error.status||500).json({message:error.message});}
});

router.get("/credit-note-summary",auth,async(req,res)=>{
  try{const rows=await CreditNote.aggregate([{$match:{createdBy:new mongoose.Types.ObjectId(owner(req)),status:"Posted"}},{$group:{_id:null,total:{$sum:"$totals.grandTotal"},count:{$sum:1},adjusted:{$sum:"$settlement.adjustmentAmount"},refund:{$sum:"$settlement.refundAmount"},customerCredit:{$sum:"$settlement.customerCreditAmount"}}}]);res.json({total:round2(rows[0]?.total),count:rows[0]?.count||0,adjusted:round2(rows[0]?.adjusted),refund:round2(rows[0]?.refund),customerCredit:round2(rows[0]?.customerCredit)});}catch(error){res.status(error.status||500).json({message:error.message});}
});

router.get("/dashboard-summary",auth,async(req,res)=>{
  try{
    const uid=new mongoose.Types.ObjectId(owner(req));
    const [orders,clients,products,expenses,credits]=await Promise.all([Order.aggregate([{$match:{createdBy:uid,status:{$ne:"Cancelled"}}},{$group:{_id:null,count:{$sum:1},revenue:{$sum:invoiceRevenueExpression()},paid:{$sum:"$paidAmount"},due:{$sum:"$dueAmount"}}}]),Client.countDocuments({createdBy:uid}),require("../models/Product").countDocuments({createdBy:owner(req)}),Expense.aggregate([{$match:{createdBy:uid}},{$group:{_id:null,total:{$sum:"$amount"}}}]),CreditNote.aggregate([{$match:{createdBy:uid,status:"Posted"}},{$group:{_id:null,total:{$sum:"$totals.grandTotal"}}}])]);
    const o=orders[0]||{};res.json({orders:o.count||0,revenue:round2(o.revenue),paid:round2(o.paid),due:round2(o.due),clients,products,expenses:round2(expenses[0]?.total),creditNotes:round2(credits[0]?.total)});
  }catch(error){res.status(error.status||500).json({message:error.message});}
});

function escapeReportHtml(value){
  return String(value??"")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function buildReportHtml(data,timeframe){
  const rows=(data.salesData||[]).map(row=>
    "<tr><td>"+escapeReportHtml(row._id)+"</td><td>"+Number(row.orderCount||0)+
    "</td><td>₹"+Number(row.totalRevenue||0).toFixed(2)+
    "</td><td>₹"+Number(row.paid||0).toFixed(2)+
    "</td><td>₹"+Number(row.due||0).toFixed(2)+"</td></tr>"
  ).join("");
  return "<!doctype html><html><head><meta charset=\"utf-8\"><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;text-align:right}th:first-child,td:first-child{text-align:left}</style></head><body><h1>Sales Report</h1><p>Period: "+
    escapeReportHtml(timeframe||"all")+
    "</p><table><thead><tr><th>Date</th><th>Orders</th><th>Revenue</th><th>Paid</th><th>Due</th></tr></thead><tbody>"+
    rows+"</tbody></table></body></html>";
}

function renderPdfBuffer(html){
  return new Promise((resolve,reject)=>{
    htmlPdf.create(html).toBuffer((error,buffer)=>{
      if(error)return reject(error);
      return resolve(buffer);
    });
  });
}

router.post("/generate-report",auth,async(req,res)=>{
  try{
    const range=dateRange(req.body?.startDate,req.body?.endDate);
    const match={createdBy:new mongoose.Types.ObjectId(owner(req)),status:{$ne:"Cancelled"}};
    if(range)match.orderDate=range;
    const salesData=await Order.aggregate([
      {$match:match},
      {$group:{
        _id:{$dateToString:{format:"%Y-%m-%d",date:"$orderDate"}},
        totalRevenue:{$sum:invoiceRevenueExpression()},
        orderCount:{$sum:1},
        paid:{$sum:"$paidAmount"},
        due:{$sum:"$dueAmount"}
      }},
      {$sort:{_id:1}}
    ]);
    const buffer=await renderPdfBuffer(buildReportHtml({salesData},req.body?.timeframe));
    res.set("Content-Type","application/pdf");
    res.set("Content-Disposition","attachment; filename=sales-report.pdf");
    return res.send(buffer);
  }catch(error){
    return res.status(error.status||500).json({message:error.message||"Unable to generate the report."});
  }
});

router.post("/send-reports",auth,async(req,res)=>{
  try{
    if(!process.env.EMAIL_USER||!process.env.EMAIL_PASS){
      return res.status(503).json({message:"Email credentials are not configured."});
    }
    const recipient=String(req.body?.email||"").trim();
    if(!/^\S+@\S+\.\S+$/.test(recipient)){
      return res.status(400).json({message:"Enter a valid recipient email address."});
    }
    const sales=await Order.aggregate([
      {$match:{createdBy:new mongoose.Types.ObjectId(owner(req)),status:{$ne:"Cancelled"}}},
      {$group:{
        _id:{$dateToString:{format:"%Y-%m-%d",date:"$orderDate"}},
        totalRevenue:{$sum:invoiceRevenueExpression()},
        orderCount:{$sum:1},
        paid:{$sum:"$paidAmount"},
        due:{$sum:"$dueAmount"}
      }},
      {$sort:{_id:1}}
    ]);
    const buffer=await renderPdfBuffer(buildReportHtml({salesData:sales},"all"));
    const transporter=nodemailer.createTransport({
      service:"gmail",
      auth:{user:process.env.EMAIL_USER,pass:process.env.EMAIL_PASS}
    });
    await transporter.sendMail({
      from:process.env.EMAIL_USER,
      to:recipient,
      subject:"Sales Report",
      text:"Please find the sales report attached.",
      attachments:[{filename:"sales-report.pdf",content:buffer}]
    });
    return res.json({message:"Report sent successfully."});
  }catch(error){
    console.error("Send reports failed:",error);
    return res.status(error.status||500).json({message:error.message||"Unable to send the report."});
  }
});
module.exports=router;