const express=require("express");
const mongoose=require("mongoose");
const Order=require("../models/Order2");
const PaymentLog=require("../models/PaymentLog2");
const auth=require("../middleware/auth");
const {syncClientData}=require("../utils/syncClientData");
const router=express.Router();
const METHODS=["Cash","Bank Transfer","UPI","Cheque","Bank"];
const round2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;

router.put("/orders/payments/bulk",auth,async(req,res)=>{
  const session=await mongoose.startSession();
  try{
    const {method="Cash",amountReference="",splitType="proportional",updates,paymentDate}=req.body||{};
    const amount=round2(req.body?.amount);
    const reference=String(amountReference||"").trim();
    if(!METHODS.includes(method))throw new Error("Invalid payment method.");
    if(!reference||reference.length>100)throw new Error("Payment reference is required.");
    if(amount<=0||amount>10000000)throw new Error("Payment amount must be between 0.01 and 10,000,000.");
    if(!["proportional","custom"].includes(splitType))throw new Error("Invalid split type.");
    if(!Array.isArray(updates)||!updates.length)throw new Error("updates[] is required.");
    const date=new Date(paymentDate);if(Number.isNaN(date.getTime()))throw new Error("Valid payment date is required.");

    session.startTransaction({writeConcern:{w:"majority",j:true}});
    const duplicate=await Order.exists({"payments.amountReference":reference,createdBy:req.user.id}).session(session);
    if(duplicate)throw new Error("Payment reference already exists.");

    const ids=[...new Set(updates.map(x=>String(typeof x==="string"?x:x?.orderId)).filter(mongoose.isValidObjectId))];
    if(!ids.length)throw new Error("No valid invoices selected.");
    const orders=await Order.find({_id:{$in:ids},createdBy:req.user.id}).session(session);
    if(orders.length!==ids.length)throw new Error("One or more selected invoices were not found.");

    const active=orders.filter(o=>Number(o.dueAmount||0)>0);
    if(!active.length)throw new Error("All selected invoices are already fully paid.");

    let allocations=[];
    if(splitType==="proportional"){
      const totalDueCents=active.reduce((s,o)=>s+Math.round(Number(o.dueAmount||0)*100),0);
      const amountCents=Math.round(amount*100);
      if(amountCents>totalDueCents)throw new Error("Payment exceeds total due of selected invoices.");
      const rows=active.map(o=>{const due=Math.round(Number(o.dueAmount||0)*100),exact=due/totalDueCents*amountCents;return{o,due,base:Math.floor(exact),frac:exact-Math.floor(exact)};});
      let remainder=amountCents-rows.reduce((s,x)=>s+x.base,0);
      rows.sort((a,b)=>b.frac-a.frac);
      for(const row of rows){if(remainder<=0)break;const give=Math.min(row.due-row.base,remainder);row.base+=give;remainder-=give;}
      if(remainder>0)throw new Error("Unable to allocate the full payment.");
      allocations=rows.filter(x=>x.base>0).map(x=>({order:x.o,appliedAmount:x.base/100}));
    }else{
      allocations=updates.map(x=>{const order=active.find(o=>String(o._id)===String(x?.orderId));if(!order)return null;const applied=round2(x?.amount);if(applied<0||applied>Number(order.dueAmount||0)+0.01)throw new Error("Custom allocation exceeds invoice due.");return{order,appliedAmount:applied};}).filter(Boolean);
      if(Math.abs(round2(allocations.reduce((s,x)=>s+x.appliedAmount,0))-amount)>0.01)throw new Error("Custom allocations must equal payment amount.");
    }
    if(!allocations.some(x=>x.appliedAmount>0))throw new Error("No positive payment allocations.");

    for(const item of allocations){
      item.order.payments.push({amount:item.appliedAmount,paymentDate:date,method,amountReference:reference,processedBy:req.user.id});
      item.order.lastPaymentDate=date;
      await item.order.save({session});
    }
    const skipped=orders.filter(o=>!active.some(a=>String(a._id)===String(o._id))).map(o=>({orderId:o._id,reason:"fully_paid"}));
    await new PaymentLog({
      reference,method,totalAmount:amount,splitType,paymentDate:date,userId:req.user.id,
      allocations:allocations.filter(x=>x.appliedAmount>0).map(x=>({orderId:x.order._id,appliedAmount:x.appliedAmount,orderNumber:x.order.orderNumber,clientName:x.order.companyName})),
      skippedOrders:skipped,transactionMetadata:{batchSize:ids.length},status:skipped.length?"partially_completed":"completed"
    }).save({session});
    await session.commitTransaction();
    await Promise.allSettled(allocations.map(x=>syncClientData(x.order.clientId)));
    res.json({message:"Bulk payment processed successfully.",reference,method,splitType,totalAmount:amount,paymentDate:date,allocations:allocations.map(x=>({orderId:x.order._id,appliedAmount:x.appliedAmount})),skippedOrders:skipped});
  }catch(error){try{await session.abortTransaction();}catch{}res.status(400).json({message:error.message});}
  finally{await session.endSession();}
});

router.get("/health",auth,(req,res)=>res.json({status:"healthy",timestamp:new Date().toISOString()}));
module.exports=router;
