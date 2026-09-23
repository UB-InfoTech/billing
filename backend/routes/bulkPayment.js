const express=require("express");
const mongoose=require("mongoose");
const Order=require("../models/Order2");
const PaymentLog=require("../models/PaymentLog2");
const auth=require("../middleware/auth");
const {syncClientData}=require("../utils/syncClientData");

const router=express.Router();
const METHODS=["Cash","Bank Transfer","UPI","Cheque","Bank"];
const round2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;

const isReplicaSetAvailable=()=>{
  const client=mongoose.connection.getClient?.();
  const topology=client?.topology?.description;
  if(!topology)return false;
  return Object.values(topology.servers||{}).some(
    server=>server.type==="RSPrimary"||server.type==="RSSecondary"||server.type==="Mongos"
  );
};

const validReference=value=>{
  const reference=String(value||"").trim();
  return reference.length>0&&reference.length<=100;
};

const normalizeUpdates=updates=>{
  const byId=new Map();
  for(const raw of updates){
    const orderId=String(typeof raw==="string"?raw:raw?.orderId||"");
    if(!mongoose.isValidObjectId(orderId))continue;
    const amount=round2(typeof raw==="string"?0:raw?.amount);
    const previous=byId.get(orderId);
    byId.set(orderId,{orderId,amount:round2((previous?.amount||0)+amount)});
  }
  return [...byId.values()];
};

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
    if(!validReference(reference))throw new Error("Payment reference is required and must be at most 100 characters.");
    if(!Number.isFinite(amount)||amount<=0||amount>10000000)throw new Error("Payment amount must be between 0.01 and 10,000,000.");
    if(!["proportional","custom"].includes(splitType))throw new Error("Invalid split type.");
    if(!Array.isArray(updates)||!updates.length)throw new Error("updates[] is required.");
    if(!paymentDate||Number.isNaN(parsedDate.getTime()))throw new Error("Valid payment date is required.");

    const normalized=normalizeUpdates(updates);
    if(!normalized.length)throw new Error("No valid invoices were selected.");

    if(session)session.startTransaction({writeConcern:{w:"majority",j:true}});

    const duplicateQuery=Order.exists({"payments.amountReference":reference,createdBy:req.user.id});
    if(session)duplicateQuery.session(session);
    if(await duplicateQuery)throw new Error("Payment reference already exists.");

    const ids=normalized.map(x=>x.orderId);
    const orderQuery=Order.find({_id:{$in:ids},createdBy:req.user.id});
    if(session)orderQuery.session(session);
    const orders=await orderQuery;
    if(orders.length!==ids.length)throw new Error("One or more selected invoices were not found.");

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
      if(amountCents>totalDueCents)throw new Error("Payment exceeds total due of selected invoices.");

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
      if(remainder!==0)throw new Error("Unable to allocate the full payment.");
      allocations=rows.filter(row=>row.base>0).map(row=>({order:row.order,appliedAmount:row.base/100}));
    }else{
      const customById=new Map(normalized.map(x=>[x.orderId,x.amount]));
      allocations=active.map(order=>{
        const applied=round2(customById.get(String(order._id))||0);
        if(applied>Number(order.dueAmount||0)+0.01){
          throw new Error(`Custom allocation exceeds due for invoice ${order.orderNumber||order._id}.`);
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
        processedBy:req.user.id
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
      userId:req.user.id,
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

router.get("/health",auth,(req,res)=>res.json({
  status:"healthy",
  timestamp:new Date().toISOString(),
  transactionMode:isReplicaSetAvailable()?"mongodb-transaction":"standalone-compensation"
}));

module.exports=router;
