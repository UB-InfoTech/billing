const express=require("express");
const mongoose=require("mongoose");
const fs=require("fs");
const path=require("path");
const ejs=require("ejs");
const nodemailer=require("nodemailer");
const Order=require("../models/Order2");
const Profile=require("../models/Profile");
const Client=require("../models/Client");
const CreditNote=require("../models/CreditNote");
const PaymentLog=require("../models/PaymentLog2");
const auth=require("../middleware/auth");
const {syncClientData}=require("../utils/syncClientData");
const router=express.Router();

const STATUSES=["Pending","In Process","Completed","Cancelled","Dispatched"];
const METHODS=["Cash","Bank Transfer","UPI","Cheque","Bank"];

const isReplicaSetAvailable=()=>{
  const client=mongoose.connection.getClient?.();
  const topology=client?.topology?.description;
  if(!topology)return false;
  return Object.values(topology.servers||{}).some(
    server=>server.type==="RSPrimary"||server.type==="RSSecondary"||server.type==="Mongos"
  );
};

const round2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;
const userId=req=>req.user.id;
const idOrNull=v=>v&&mongoose.isValidObjectId(v)?v:null;

function dateRange(req){
  const start=req.query.startDate||req.query.from;
  const end=req.query.endDate||req.query.to;
  const range={};
  if(start)range.$gte=new Date(String(start)+"T00:00:00.000");
  if(end)range.$lte=new Date(String(end)+"T23:59:59.999");
  return Object.keys(range).length?range:null;
}

async function nextOrderNumber(uid){
  const profile=await Profile.findOneAndUpdate(
    {createdBy:String(uid)},
    {$setOnInsert:{billNoPrefix:"INV-",billNoSequence:0,billNoSuffix:"",createdBy:String(uid)}},
    {new:true,upsert:true,returnDocument:"after"}
  );
  const next=Number(profile.billNoSequence||0)+1;
  await Profile.updateOne({_id:profile._id},{$set:{billNoSequence:next}});
  return String(profile.billNoPrefix||"INV-")+String(next).padStart(5,"0")+String(profile.billNoSuffix||"");
}

router.get("/sales-analytics",auth,async(req,res)=>{
  try{
    const uid=new mongoose.Types.ObjectId(userId(req));
    const now=new Date();
    const startToday=new Date(now);startToday.setHours(0,0,0,0);
    const startTomorrow=new Date(startToday);startTomorrow.setDate(startTomorrow.getDate()+1);
    const startWeek=new Date(startToday);startWeek.setDate(startWeek.getDate()-startWeek.getDay());
    const startMonth=new Date(now.getFullYear(),now.getMonth(),1);
    const startYear=new Date(now.getFullYear(),0,1);
    const [today,thisWeek,thisMonth,thisYear,byDay]=await Promise.all([
      Order.find({createdBy:uid,orderDate:{$gte:startToday,$lt:startTomorrow},status:{$ne:"Cancelled"}}).lean(),
      Order.find({createdBy:uid,orderDate:{$gte:startWeek},status:{$ne:"Cancelled"}}).lean(),
      Order.find({createdBy:uid,orderDate:{$gte:startMonth},status:{$ne:"Cancelled"}}).lean(),
      Order.find({createdBy:uid,orderDate:{$gte:startYear},status:{$ne:"Cancelled"}}).lean(),
      Order.aggregate([{ $match:{createdBy:uid,status:{$ne:"Cancelled"} } },{ $group:{_id:{$dateToString:{format:"%Y-%m-%d",date:"$orderDate"}},totalSales:{$sum:{$ifNull:["$roundOffFinalRevenue","$finalRevenue"]}},orderCount:{$sum:1}}},{$sort:{_id:1}}])
    ]);
    const shape=orders=>({totalSales:round2(orders.reduce((s,o)=>s+Number(o.roundOffFinalRevenue??o.finalRevenue??0),0)),orderCount:orders.length,orders});
    res.json({today:shape(today),thisWeek:shape(thisWeek),thisMonth:shape(thisMonth),thisYear:shape(thisYear),yesterday:{totalSales:0,orderCount:0,orders:[]},lastWeek:{totalSales:0,orderCount:0,orders:[]},lastMonth:{totalSales:0,orderCount:0,orders:[]},dailyTrend:byDay});
  }catch(error){res.status(500).json({message:error.message});}
});

router.get("/all-orders",auth,async(req,res)=>{
  try{
    const orders=await Order.find({createdBy:userId(req)}).select("orderNumber companyName finalRevenue roundOffFinalRevenue orderDate status Address State City dueAmount paidAmount paymentStatus clientId").sort({orderDate:-1}).lean();
    res.json(orders);
  }catch(error){res.status(500).json({message:error.message});}
});

router.post("/orders/create",auth,async(req,res)=>{
  try{
    const body={...(req.body||{})};
    if(body.clientId){
      const client=await Client.findOne({_id:body.clientId,createdBy:userId(req)}).lean();
      if(!client)return res.status(400).json({message:"Selected client was not found."});
      body.companyName=body.companyName||client.companyName||client.name||"";
      body.gstNumber=body.gstNumber||client.gstNumber||"";
      body.Address=body.Address||client.address||"";
      body.State=body.State||client.state||"";
      body.City=body.City||client.city||"";
      body.pinCode=body.pinCode||client.pinCode||"";
      body.stateCode=body.stateCode||client.stateCode||"";
    }
    if(!body.orderNumber)body.orderNumber=await nextOrderNumber(userId(req));
    body.createdBy=userId(req);
    const order=new Order(body);
    await order.save();
    await syncClientData(order.clientId);
    res.status(201).json({success:true,order});
  }catch(error){res.status(400).json({success:false,message:error.message});}
});

router.get("/orders",auth,async(req,res)=>{
  try{
    const query={createdBy:userId(req)};
    const search=String(req.query.search||"").trim();
    if(search){const rx=new RegExp(search.replace(/[.*+?^$()|[\\]\\\\]/g,"\\\\$&"),"i");query.$or=[{orderNumber:rx},{companyName:rx},{gstNumber:rx},{challanNumber:rx}];}
    if(req.query.status&&STATUSES.includes(req.query.status))query.status=req.query.status;
    if(req.query.paymentStatus&&["Unpaid","Partial","Paid"].includes(req.query.paymentStatus))query.paymentStatus=req.query.paymentStatus;
    if(idOrNull(req.query.clientId))query.clientId=req.query.clientId;
    const range=dateRange(req);if(range)query.orderDate=range;
    const page=Math.max(parseInt(req.query.page,10)||1,1),limit=Math.min(Math.max(parseInt(req.query.limit,10)||100,1),200);
    const sortField=["orderDate","orderNumber","companyName","dueAmount","finalRevenue","createdAt"].includes(req.query.sort)?req.query.sort:"orderDate";
    const sortDir=req.query.order==="asc"?1:-1;
    const [orders,total]=await Promise.all([Order.find(query).sort({[sortField]:sortDir}).skip((page-1)*limit).limit(limit).lean(),Order.countDocuments(query)]);
    res.json({success:true,orders,pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))}});
  }catch(error){res.status(500).json({success:false,message:error.message});}
});

router.get("/orders/:id",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({success:false,message:"Invalid order ID."});
    const order=await Order.findOne({_id:req.params.id,createdBy:userId(req)}).lean();
    if(!order)return res.status(404).json({success:false,message:"Order not found"});
    res.json({success:true,order});
  }catch(error){res.status(500).json({success:false,message:error.message});}
});

router.put("/orders/:id/update",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid order ID."});
    const order=await Order.findOne({_id:req.params.id,createdBy:userId(req)});if(!order)return res.status(404).json({message:"Order not found"});
    const oldClient=String(order.clientId||"");
    const allowed=["orderNumber","challanNumber","lrNo","orderDate","subOrders","Address","State","City","pinCode","stateCode","clientId","gstNumber","companyName","status","paymentTerms","taxPercentage","discountRate","note","netProfit"];
    for(const key of allowed)if(req.body?.[key]!==undefined)order[key]=req.body[key];
    await order.save();
    const newClient=String(order.clientId||"");
    if(oldClient)await syncClientData(oldClient);if(newClient&&newClient!==oldClient)await syncClientData(newClient);
    res.json({success:true,message:"Order updated successfully",order});
  }catch(error){res.status(400).json({success:false,message:error.message});}
});

router.patch("/orders/:id/upd",auth,async(req,res)=>{
  try{
    if(!STATUSES.includes(req.body?.status))return res.status(400).json({message:"Invalid order status."});
    const order=await Order.findOne({_id:req.params.id,createdBy:userId(req)});if(!order)return res.status(404).json({message:"Order not found"});
    order.status=req.body.status;order.statusHistory=Array.isArray(order.statusHistory)?order.statusHistory:[];order.statusHistory.push({status:req.body.status,timestamp:new Date()});
    await order.save();await syncClientData(order.clientId);res.json({message:"Order status updated",order});
  }catch(error){res.status(400).json({message:error.message});}
});

router.delete("/orders/:id/delete",auth,async(req,res)=>{
  try{
    const order=await Order.findOne({_id:req.params.id,createdBy:userId(req)});if(!order)return res.status(404).json({success:false,message:"Order not found"});
    if(Number(order.dueAmount||0)>0)return res.status(400).json({success:false,message:"Cannot delete order with pending amount."});
    const postedCredits=await CreditNote.countDocuments({originalOrderId:order._id,status:"Posted"});if(postedCredits>0)return res.status(400).json({message:"Cancel posted Credit Notes before deleting this invoice."});
    await Order.deleteOne({_id:order._id});await syncClientData(order.clientId);res.json({success:true,message:"Order deleted successfully"});
  }catch(error){res.status(500).json({success:false,message:error.message});}
});

router.post("/orders/:id/pay",auth,async(req,res)=>{
  const transactional=isReplicaSetAvailable();
  const session=transactional?await mongoose.startSession():null;

  try{
    const uid=userId(req);
    const amount=round2(req.body?.amount);
    const method=req.body?.method||"Cash";
    const reference=String(req.body?.amountReference||"").trim();
    const paymentDate=new Date(req.body?.paymentDate||new Date());

    if(!uid)return res.status(401).json({message:"Authentication required."});
    if(amount<=0)return res.status(400).json({message:"Payment amount must be greater than zero."});
    if(!METHODS.includes(method))return res.status(400).json({message:"Invalid payment method."});
    if(Number.isNaN(paymentDate.getTime()))return res.status(400).json({message:"Invalid payment date."});
    if(reference.length>100)return res.status(400).json({message:"Payment reference must be at most 100 characters."});

    if(session)session.startTransaction();

    const findOrder=Order.findOne({_id:req.params.id,createdBy:uid});
    if(session)findOrder.session(session);
    const order=await findOrder;
    if(!order)throw new Error("Order not found.");

    if(amount>Number(order.dueAmount||0)+0.01){
      throw new Error(`Payment amount exceeds the current due balance of ₹${Number(order.dueAmount||0).toFixed(2)}.`);
    }

    if(reference){
      const duplicateQuery=Order.exists({
        "payments.amountReference":reference,
        createdBy:uid,
      });
      if(session)duplicateQuery.session(session);
      const duplicate=await duplicateQuery;
      if(duplicate)throw new Error("Payment reference already exists.");
    }

    order.payments.push({
      amount,
      paymentDate,
      method,
      amountReference:reference,
      processedBy:uid,
    });
    order.lastPaymentDate=paymentDate;
    await order.save(session?{session}:undefined);

    if(session)await session.commitTransaction();
    await syncClientData(order.clientId);

    return res.json({success:true,message:"Payment recorded successfully.",order});
  }catch(error){
    if(session){
      try{if(session.inTransaction())await session.abortTransaction();}catch{}
    }
    console.error("Payment create error:",error);
    return res.status(400).json({success:false,message:error.message||"Unable to record payment."});
  }finally{
    if(session)await session.endSession();
  }
});

router.get("/orders/:id/payments",auth,async(req,res)=>{
  try{
    const order=await Order.findOne({_id:req.params.id,createdBy:userId(req)}).select("payments");
    if(!order)return res.status(404).json({message:"Order not found"});
    res.json(order.payments||[]);
  }catch(error){
    res.status(500).json({message:error.message});
  }
});

router.put("/orders/:orderId/payments/:paymentId",auth,async(req,res)=>{
  const transactional=isReplicaSetAvailable();
  const session=transactional?await mongoose.startSession():null;

  try{
    const uid=userId(req);
    const amount=round2(req.body?.amount);
    const method=req.body?.method||"Cash";
    const reference=String(req.body?.amountReference||"").trim();
    const paymentDate=new Date(req.body?.paymentDate||new Date());

    if(amount<=0)return res.status(400).json({message:"Payment amount must be greater than zero."});
    if(!METHODS.includes(method))return res.status(400).json({message:"Invalid payment method."});
    if(Number.isNaN(paymentDate.getTime()))return res.status(400).json({message:"Invalid payment date."});
    if(reference.length>100)return res.status(400).json({message:"Payment reference must be at most 100 characters."});

    if(session)session.startTransaction();

    const findOrder=Order.findOne({_id:req.params.orderId,createdBy:uid});
    if(session)findOrder.session(session);
    const order=await findOrder;
    if(!order)throw new Error("Order not found.");

    const payment=order.payments.id(req.params.paymentId);
    if(!payment)throw new Error("Payment not found.");

    const available=Number(order.dueAmount||0)+Number(payment.amount||0);
    if(amount>available+0.01)throw new Error("Payment amount exceeds the available invoice balance.");

    if(reference&&reference!==payment.amountReference){
      const duplicateQuery=Order.exists({
        "payments.amountReference":reference,
        createdBy:uid,
        _id:{$ne:order._id}
      });
      if(session)duplicateQuery.session(session);
      const duplicate=await duplicateQuery;
      if(duplicate)throw new Error("Payment reference already exists.");
    }

    payment.amount=amount;
    payment.method=method;
    payment.amountReference=reference;
    payment.paymentDate=paymentDate;

    await order.save(session?{session}:undefined);
    if(session)await session.commitTransaction();
    await syncClientData(order.clientId);

    return res.json({success:true,message:"Payment updated successfully.",order});
  }catch(error){
    if(session){
      try{if(session.inTransaction())await session.abortTransaction();}catch{}
    }
    console.error("Payment update error:",error);
    return res.status(400).json({message:error.message||"Unable to update payment."});
  }finally{
    if(session)await session.endSession();
  }
});

router.delete("/orders/:orderId/payments/:paymentId",auth,async(req,res)=>{
  const transactional=isReplicaSetAvailable();
  const session=transactional?await mongoose.startSession():null;

  try{
    if(session)session.startTransaction();

    const findOrder=Order.findOne({_id:req.params.orderId,createdBy:userId(req)});
    if(session)findOrder.session(session);
    const order=await findOrder;
    if(!order)throw new Error("Order not found.");

    const payment=order.payments.id(req.params.paymentId);
    if(!payment)throw new Error("Payment not found.");

    order.payments.pull({_id:req.params.paymentId});
    await order.save(session?{session}:undefined);

    if(session)await session.commitTransaction();
    await syncClientData(order.clientId);

    return res.json({success:true,message:"Payment deleted successfully.",order});
  }catch(error){
    if(session){
      try{if(session.inTransaction())await session.abortTransaction();}catch{}
    }
    console.error("Payment delete error:",error);
    return res.status(400).json({message:error.message||"Unable to delete payment."});
  }finally{
    if(session)await session.endSession();
  }
});

router.put("/orders/payments/bulk",auth,async(req,res)=>{
  const transactional=isReplicaSetAvailable();
  const session=transactional?await mongoose.startSession():null;
  const savedAllocations=[];

  try{
    const {method="Cash",amountReference="",splitType="proportional",updates,paymentDate}=req.body||{};
    const amount=round2(req.body?.amount);
    const reference=String(amountReference||"").trim();
    const parsedDate=new Date(paymentDate);

    if(!METHODS.includes(method))throw new Error("Invalid payment method.");
    if(!referenceAllowed(reference))throw new Error("Payment reference is required and must be at most 100 characters.");
    if(!Number.isFinite(amount)||amount<=0||amount>10000000)throw new Error("Payment amount must be between 0.01 and 10,000,000.");
    if(!["proportional","custom"].includes(splitType))throw new Error("Invalid split type.");
    if(!Array.isArray(updates)||!updates.length)throw new Error("updates[] is required.");
    if(!paymentDate||Number.isNaN(parsedDate.getTime()))throw new Error("Valid paymentDate is required.");

    const byId=new Map();
    for(const raw of updates){
      const oid=String(typeof raw==="string"?raw:raw?.orderId||"");
      if(!mongoose.isValidObjectId(oid))continue;
      const customAmount=round2(typeof raw==="string"?0:raw?.amount);
      const current=byId.get(oid)||0;
      byId.set(oid,round2(current+customAmount));
    }
    const ids=[...byId.keys()];
    if(!ids.length)throw new Error("No valid order IDs supplied.");

    if(session)session.startTransaction({writeConcern:{w:"majority",j:true}});

    const duplicateQuery=Order.exists({"payments.amountReference":reference,createdBy:userId(req)});
    if(session)duplicateQuery.session(session);
    if(await duplicateQuery)throw new Error("Payment reference already exists.");

    const orderQuery=Order.find({_id:{$in:ids},createdBy:userId(req)});
    if(session)orderQuery.session(session);
    const orders=await orderQuery;
    if(orders.length!==ids.length)throw new Error("One or more selected invoices could not be found.");

    const active=orders.filter(o=>o.status!=="Cancelled"&&Number(o.dueAmount||0)>0);
    if(!active.length)throw new Error("All selected invoices are already paid or cancelled.");

    const activeIds=new Set(active.map(o=>String(o._id)));
    const skipped=orders.filter(o=>!activeIds.has(String(o._id))).map(o=>({
      orderId:o._id,
      reason:o.status==="Cancelled"?"cancelled":"fully_paid"
    }));

    let allocations=[];

    if(splitType==="proportional"){
      const totalDueCents=active.reduce((sum,o)=>sum+Math.round(Number(o.dueAmount||0)*100),0);
      const amountCents=Math.round(amount*100);
      if(amountCents>totalDueCents)throw new Error("Payment exceeds total due amount of selected orders.");

      const rows=active.map(order=>{
        const due=Math.round(Number(order.dueAmount||0)*100);
        const exact=due/totalDueCents*amountCents;
        const base=Math.floor(exact);
        return{order,due,base,frac:exact-base};
      });
      let remainder=amountCents-rows.reduce((sum,row)=>sum+row.base,0);
      rows.sort((a,b)=>b.frac-a.frac);
      for(const row of rows){
        if(remainder<=0)break;
        const give=Math.min(row.due-row.base,remainder);
        row.base+=give;
        remainder-=give;
      }
      if(remainder!==0)throw new Error("Unable to allocate payment without exceeding invoice dues.");
      allocations=rows.filter(row=>row.base>0).map(row=>({order:row.order,appliedAmount:row.base/100}));
    }else{
      allocations=active.map(order=>{
        const applied=round2(byId.get(String(order._id))||0);
        if(applied>Number(order.dueAmount||0)+0.01){
          throw new Error(`Custom allocation exceeds invoice due for \${order.orderNumber||order._id}.`);
        }
        return{order,appliedAmount:applied};
      }).filter(item=>item.appliedAmount>0);

      const totalCustom=round2(allocations.reduce((sum,item)=>sum+item.appliedAmount,0));
      if(Math.abs(totalCustom-amount)>0.01)throw new Error("Custom allocations must equal payment amount.");
    }

    if(!allocations.length)throw new Error("No positive payment allocations.");

    const allocatedCents=allocations.reduce((sum,item)=>sum+Math.round(item.appliedAmount*100),0);
    if(allocatedCents!==Math.round(amount*100))throw new Error("Payment allocation must equal payment amount.");

    for(const item of allocations){
      item.order.payments.push({
        amount:item.appliedAmount,
        paymentDate:parsedDate,
        method,
        amountReference:reference,
        processedBy:userId(req)
      });
      item.order.lastPaymentDate=parsedDate;
      await item.order.save(session?{session}:undefined);
      const payment=item.order.payments[item.order.payments.length-1];
      savedAllocations.push({order:item.order,paymentId:payment?._id});
    }

    const log=new PaymentLog({
      reference,
      method,
      totalAmount:amount,
      splitType,
      paymentDate:parsedDate,
      userId:userId(req),
      allocations:allocations.map(item=>({
        orderId:item.order._id,
        appliedAmount:item.appliedAmount,
        orderNumber:item.order.orderNumber||"",
        clientName:item.order.companyName||""
      })),
      skippedOrders:skipped,
      transactionMetadata:{batchSize:ids.length},
      status:skipped.length?"partially_completed":"completed"
    });
    await log.save(session?{session}:undefined);

    if(session)await session.commitTransaction();

    const clientIds=[...new Set(allocations.map(item=>String(item.order.clientId||"")).filter(Boolean))];
    await Promise.allSettled(clientIds.map(clientId=>syncClientData(clientId)));

    return res.json({
      success:true,
      message:"Bulk payment processed successfully.",
      reference,
      method,
      splitType,
      totalAmount:amount,
      paymentDate:parsedDate,
      allocations:allocations.map(item=>({
        orderId:item.order._id,
        orderNumber:item.order.orderNumber||"",
        appliedAmount:item.appliedAmount
      })),
      skippedOrders:skipped
    });
  }catch(error){
    if(session){
      try{if(session.inTransaction())await session.abortTransaction();}catch{}
    }else if(savedAllocations.length){
      for(const item of savedAllocations.reverse()){
        try{
          item.order.payments.pull({_id:item.paymentId});
          await item.order.save();
        }catch(rollbackError){
          console.error("Bulk payment rollback failed:",rollbackError);
        }
      }
    }
    console.error("Bulk payment error:",error);
    return res.status(400).json({success:false,message:error.message||"Unable to process bulk payment."});
  }finally{
    if(session)await session.endSession();
  }
});

function referenceAllowed(value){const x=String(value||"").trim();return x.length>0&&x.length<=100;}

function numberToWords(amount){
  const ones=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"],tens=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  let n=Math.floor(Number(amount||0));if(n===0)return"Zero Rupees Only";
  const two=(x)=>x<20?ones[x]:tens[Math.floor(x/10)]+(x%10?" "+ones[x%10]:"");const parts=[];
  const crore=Math.floor(n/10000000);if(crore)parts.push(two(crore),"Crore");n%=10000000;const lakh=Math.floor(n/100000);if(lakh)parts.push(two(lakh),"Lakh");n%=100000;const thousand=Math.floor(n/1000);if(thousand)parts.push(two(thousand),"Thousand");n%=1000;const hundred=Math.floor(n/100);if(hundred)parts.push(ones[hundred],"Hundred");n%=100;if(n)parts.push(two(n));
  return parts.join(" ")+" Rupees Only";
}

function invoiceEscape(value){
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function renderSimpleInvoiceHtml({order,profile,client}){
  const dueDate=new Date(order.orderDate||new Date());
  const terms=Number(order.paymentTerms);
  if(Number.isFinite(terms))dueDate.setDate(dueDate.getDate()+terms);

  const rows=(order.subOrders||[]).map((item,index)=>{
    const qtyUnit=item.qtyUnit||"PCS";
    const qty=qtyUnit==="MTR"?Number(item.MTR||0):Number(item.quantity||0);
    const amount=round2(qty*Number(item.unitPrice||0));
    return `<tr>
      <td>${index+1}</td>
      <td>${invoiceEscape(item.orderName||"")}</td>
      <td>${invoiceEscape(item.designNumber||"")}</td>
      <td>${invoiceEscape(item.hsnCode??"")}</td>
      <td>${qty.toFixed(2)} ${invoiceEscape(qtyUnit)}</td>
      <td>${Number(item.unitPrice||0).toFixed(2)}</td>
      <td>${amount.toFixed(2)}</td>
    </tr>`;
  }).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ${invoiceEscape(order.orderNumber||"")}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#111;background:#fff}
    .sheet{max-width:1100px;margin:0 auto}
    .top{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #111;padding-bottom:14px}
    h1,h2,p{margin:0 0 6px}.muted{color:#555}
    table{width:100%;border-collapse:collapse;margin-top:18px}
    th,td{border:1px solid #222;padding:7px;font-size:13px}
    th{background:#f3f3f3}.right{text-align:right}
    .summary{margin-left:auto;width:320px;margin-top:16px}
    .summary div{display:flex;justify-content:space-between;padding:4px 0}
    @media print{body{padding:0}.sheet{max-width:none}}
  </style></head><body><div class="sheet">
  <div class="top"><div><div class="muted">${invoiceEscape(profile.headerTitle||"TAX INVOICE")}</div><h1>${invoiceEscape(profile.companyName||"Company")}</h1><div>${invoiceEscape(profile.companyAddress||"")}</div><div>GSTIN: ${invoiceEscape(profile.gstin||"")}</div><div>Phone: ${invoiceEscape(profile.phoneNumber1||"")}</div></div>
  <div><h2>Invoice</h2><div><b>No.:</b> ${invoiceEscape(order.orderNumber||"")}</div><div><b>Date:</b> ${invoiceEscape(new Date(order.orderDate||new Date()).toLocaleDateString("en-IN"))}</div><div><b>Due:</b> ${invoiceEscape(dueDate.toLocaleDateString("en-IN"))}</div></div></div>
  <div style="margin-top:18px"><h3>Bill To</h3><div><b>${invoiceEscape(order.companyName||client?.companyName||client?.name||"Customer")}</b></div><div>${invoiceEscape(order.Address||client?.address||"")}</div><div>${invoiceEscape(order.City||client?.city||"")}, ${invoiceEscape(order.State||client?.state||"")}</div><div>GSTIN: ${invoiceEscape(order.gstNumber||client?.gstNumber||"")}</div></div>
  <table><thead><tr><th>#</th><th>Description</th><th>Design</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${rows||'<tr><td colspan="7">No line items.</td></tr>'}</tbody></table>
  <div class="summary"><div><span>Taxable</span><span>₹${Number(order.totalCost||0).toFixed(2)}</span></div><div><span>Tax</span><span>₹${Number(order.taxAmount||0).toFixed(2)}</span></div><div><span>Round Off</span><span>₹${round2(Number(order.roundOffFinalRevenue||0)-Number(order.finalRevenue||0)).toFixed(2)}</span></div><div style="border-top:2px solid #111;font-weight:700"><span>Invoice Total</span><span>₹${Number(order.roundOffFinalRevenue||0).toFixed(2)}</span></div></div>
  <div style="margin-top:28px;border-top:1px solid #999;padding-top:10px;font-size:12px">Payment Status: ${invoiceEscape(order.paymentStatus||"Unpaid")} &nbsp; | &nbsp; Paid: ₹${Number(order.paidAmount||0).toFixed(2)} &nbsp; | &nbsp; Due: ₹${Number(order.dueAmount||0).toFixed(2)}</div>
  </div></body></html>`;
}

async function renderInvoice(order,res){
  const profile=await Profile.findOne({createdBy:String(order.createdBy)}).lean()||{};
  const client=order.clientId?await Client.findById(order.clientId).lean():null;
  const dueDate=new Date(order.orderDate||new Date());
  const terms=Number(order.paymentTerms);
  if(Number.isFinite(terms))dueDate.setDate(dueDate.getDate()+terms);

  try{
    const html=await ejs.renderFile(path.join(__dirname,"../public/invoiceTable.ejs"),{
      profileHeaderTitle:profile.headerTitle||"Invoice",profileCompanyName:profile.companyName||"Company",profileCompanyAddress:profile.companyAddress||"",profilePhoneNumber1:profile.phoneNumber1||"",profilePhoneNumber2:profile.phoneNumber2||"",profileGstNumber:profile.gstin||"",profilePanNumber:profile.pan||"",profileBankName:profile.bankName||"",profileAccountNo:profile.accountNo||"",profileBranchName:profile.branchName||"",profileIfsc:profile.ifsc||"",
      clientChallanNumber:order.challanNumber||"",clientCompanyName:order.companyName||"",clientAddress:order.Address||"",clientPhoneNumber:client?.phone||"",clientGstNumber:order.gstNumber||"",clientState:client?.state||order.State||"",
      orderNumber:order.orderNumber||"",createdAt:new Date(order.orderDate).toLocaleDateString("en-IN"),dueDate:dueDate.toLocaleDateString("en-IN"),paymentTerm:order.paymentTerms||"",ewayBillNo:order.ewbDetails?.ewbNo||"N/A",subOrders:order.subOrders||[],orderTotalCost:order.totalCost||0,orderSubTotal:round2(Number(order.totalCost||0)+Number(order.discountAmount||0)),orderDisRate:order.discountRate||0,orderDiscountAmount:order.discountAmount||0,orderTax:round2(Number(order.taxPercentage||0)/2),orderTaxAmount:round2(Number(order.taxAmount||0)/2),orderIgstTax:Number(order.stateCode)!==Number(profile.stateCode)?Number(order.taxPercentage||0):0,orderIgstTaxAmount:Number(order.stateCode)!==Number(profile.stateCode)?Number(order.taxAmount||0):0,orderFinalRevenue:order.finalRevenue||0,orderFinalRevenueRoundOff:round2(Number(order.roundOffFinalRevenue||0)-Number(order.finalRevenue||0)),orderFinalRevenueAfterRoundOff:order.roundOffFinalRevenue||0,orderFinalRevenueInWords:numberToWords(order.roundOffFinalRevenue||0),paymentStatus:order.paymentStatus,dueAmount:order.dueAmount||0,creditAppliedAmount:order.creditAppliedAmount||0,payments:order.payments||[]
    });
    return res.type("html").send(html);
  }catch(error){
    console.error("Invoice template render failed; using simple fallback:",error);
    return res.type("html").send(renderSimpleInvoiceHtml({order,profile,client}));
  }
}

router.get("/:orderId/invoice",auth,async(req,res)=>{try{const order=await Order.findOne({_id:req.params.orderId,createdBy:userId(req)}).lean();if(!order)return res.status(404).json({message:"Order not found"});await renderInvoice(order,res);}catch(error){res.status(500).json({message:"Error generating invoice",error:error.message});}});
router.get("/:orderId/KachuBill",auth,async(req,res)=>{try{const order=await Order.findOne({_id:req.params.orderId,createdBy:userId(req)}).lean();if(!order)return res.status(404).json({message:"Order not found"});await renderInvoice(order,res);}catch(error){res.status(500).json({message:"Error generating bill",error:error.message});}});

router.get("/:orderId/payments/:paymentId/invoice",auth,async(req,res)=>{
  try{
    const order=await Order.findOne({_id:req.params.orderId,createdBy:userId(req)}).lean();
    if(!order)return res.status(404).json({message:"Order not found"});

    const payment=(order.payments||[]).find(p=>String(p._id)===String(req.params.paymentId));
    if(!payment)return res.status(404).json({message:"Payment not found"});

    const profile=await Profile.findOne({createdBy:String(req.user.id)}).lean()||{};
    const client=order.clientId
      ? await Client.findOne({_id:order.clientId,createdBy:userId(req)}).lean()
      : null;

    const paymentAmount=Number(payment.amount||0);
    const invoiceTotal=Number(order.roundOffFinalRevenue||order.finalRevenue||order.totalAmount||0);
    const previousDue=Math.max(0,round2(Number(order.dueAmount||0)+paymentAmount));
    const balanceAfter=Math.max(0,round2(previousDue-paymentAmount));

    const paymentDate=new Date(payment.paymentDate||payment.createdAt||new Date());
    const receiptDate=paymentDate.toLocaleString("en-IN");
    const invoiceDate=new Date(order.orderDate||new Date()).toLocaleDateString("en-IN");

    const template=fs.readFileSync(path.join(__dirname,"../public/reciptTable.html"),"utf8");
    const replacements={
      VorderNumber:order.orderNumber||"N/A",
      VorderName:order.companyName||"N/A",
      VpaymentId:String(payment._id),
      VreceiptCreatedDate:receiptDate,
      VreceiptPaymentMode:payment.method||"N/A",
      VreceiptPaymentReference:payment.amountReference||"N/A",
      VclintCompanyName:order.companyName||client?.companyName||client?.name||"N/A",
      VclintAddress:order.Address||client?.address||"N/A",
      VclintCityStatePin:[order.City||client?.city,order.State||client?.state,order.pinCode||client?.pinCode].filter(Boolean).join(", ")||"N/A",
      VclintEmail:client?.email||"N/A",
      VclintPhoneNumber:client?.phone||client?.phoneNumber||"N/A",
      VclintGstNumber:order.gstNumber||client?.gstNumber||"N/A",
      VclintChallanNumber:order.challanNumber||"N/A",
      VamountReceived:paymentAmount.toFixed(2),
      VorderFinalRevenue:invoiceTotal.toFixed(2),
      VpreviousDue:previousDue.toFixed(2),
      VbalanceAfterPayment:balanceAfter.toFixed(2),
      VtodayDate:paymentDate.toLocaleDateString("en-IN"),
      VcreatedAt:invoiceDate,
      VcompanyTitle:profile.headerTitle||"",
      VcompanyName:profile.companyName||"Company",
      VcompanyAddress:profile.companyAddress||"",
      VcompanyPhone:[profile.phoneNumber1,profile.phoneNumber2].filter(Boolean).join(" / ")||"",
      VcompanyGstin:profile.gstin||"",
      VcompanyPan:profile.pan||"",
      VbankName:profile.bankName||"",
      VaccountNo:profile.accountNo||"",
      VbranchName:profile.branchName||"",
      Vifsc:profile.ifsc||"",
      VamountInWords:numberToWords(paymentAmount)
    };

    let html=template;
    for(const [key,value] of Object.entries(replacements)){
      html=html.replaceAll(key,invoiceEscape(value));
    }

    res.set("Cache-Control","no-store");
    return res.type("html").send(html);
  }catch(error){
    console.error("Payment receipt render error:",error);
    return res.status(500).json({message:error?.message||"Unable to generate payment receipt."});
  }
});

router.post("/payment-reminders/send",auth,async(req,res)=>{
  try{
    if(!process.env.EMAIL_USER||!process.env.EMAIL_PASS)return res.status(503).json({message:"Email credentials are not configured."});
    const orders=await Order.find({createdBy:userId(req),status:{$ne:"Cancelled"},paymentStatus:{$ne:"Paid"},dueAmount:{$gt:0}}).lean();
    const ids=orders.map(o=>o.clientId).filter(Boolean);const clients=await Client.find({_id:{$in:ids},createdBy:userId(req),email:{$ne:""}}).lean();const byId=new Map(clients.map(c=>[String(c._id),c]));
    const transporter=nodemailer.createTransport({service:"gmail",auth:{user:process.env.EMAIL_USER,pass:process.env.EMAIL_PASS}});let sent=0;
    for(const order of orders){const client=byId.get(String(order.clientId));if(!client)continue;await transporter.sendMail({from:process.env.EMAIL_USER,to:client.email,subject:"Payment Reminder - "+(order.orderNumber||"Invoice"),text:"Dear "+(client.name||client.companyName||"Customer")+", your invoice "+(order.orderNumber||"")+" has an outstanding balance of ₹"+Number(order.dueAmount||0).toFixed(2)+". Please arrange payment at your earliest convenience."});sent++;}
    res.json({message:"Payment reminders processed.",sent,totalEligible:orders.length});
  }catch(error){res.status(500).json({message:error.message});}
});

module.exports=router;