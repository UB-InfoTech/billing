const express=require("express");
const mongoose=require("mongoose");
const Order=require("../models/Order2");
const PaymentLog=require("../models/PaymentLog2");
const auth=require("../middleware/auth");
const {syncClientDataSafely}=require("../utils/syncClientData");

const router=express.Router();
const METHODS=["Cash","Bank Transfer","UPI","Cheque","Bank"];
const round2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;
const {normalizePaymentUpdates}=require("../utils/bulkPaymentAllocations");
const {buildPaymentAppendOperation}=require("../utils/paymentAppendOperation");
const {reservePaymentReference,releasePaymentReference}=require("../utils/paymentReferenceReservation");

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



router.put("/orders/payments/bulk",auth,async(req,res)=>{
  const transactional=isReplicaSetAvailable();
  const session=transactional?await mongoose.startSession():null;
  const savedAllocations=[];
  let rollbackIncomplete=false;
  let reservedReferenceId=null;

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
    if(!paymentDate||Number.isNaN(parsedDate.getTime()))throw new Error("Valid paymentDate is required.");

    const normalized=normalizePaymentUpdates(
      updates,
      value=>mongoose.isValidObjectId(value)
    );
    const byId=new Map(normalized.map(item=>[item.orderId,item.amount]));
    const ids=normalized.map(item=>item.orderId);

    if(session)session.startTransaction({writeConcern:{w:"majority",j:true}});

    const duplicateOrderQuery=Order.exists({"payments.amountReference":reference,createdBy:req.user.id});
    const duplicateLogQuery=PaymentLog.exists({userId:req.user.id,reference});
    if(session){duplicateOrderQuery.session(session);duplicateLogQuery.session(session);}
    const [duplicateOrder,duplicateLog]=await Promise.all([duplicateOrderQuery,duplicateLogQuery]);
    if(duplicateOrder||duplicateLog){
      const conflict=new Error("Payment reference already exists. Use a different reference.");
      conflict.status=409;
      throw conflict;
    }
    reservedReferenceId=await reservePaymentReference({
      createdBy:req.user.id,reference,kind:"bulk",session
    });

    const orderQuery=Order.find({_id:{$in:ids},createdBy:req.user.id});
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
        if(Math.round(applied*100)>Math.round(Number(order.dueAmount||0)*100)){
          throw new Error(`Custom allocation exceeds invoice due for ${order.orderNumber||order._id}.`);
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
      const paymentData={
        amount:item.appliedAmount,
        paymentDate:parsedDate,
        method,
        amountReference:reference,
        processedBy:req.user.id
      };
      const operation=buildPaymentAppendOperation({
        orderId:item.order._id,
        createdBy:req.user.id,
        amount:item.appliedAmount,
        expectedDueAmount:Number(item.order.dueAmount||0),
        payment:paymentData,
        paymentDate:parsedDate
      });
      const paymentWrite=Order.findOneAndUpdate(
        operation.filter,
        operation.update,
        operation.options
      );
      if(session)paymentWrite.session(session);
      const updatedOrder=await paymentWrite;
      if(!updatedOrder){
        const conflict=new Error(
          `Invoice ${item.order.orderNumber||item.order._id} changed while this bulk payment was processing. Refresh the selected invoices and try again.`
        );
        conflict.status=409;
        throw conflict;
      }

      const payment=updatedOrder.payments[updatedOrder.payments.length-1];
      savedAllocations.push({
        orderId:updatedOrder._id,
        createdBy:req.user.id,
        paymentId:payment?._id
      });
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
    reservedReferenceId=null;

    const clientIds=[...new Set(allocations.map(item=>String(item.order.clientId||"")).filter(Boolean))];
    await Promise.allSettled(clientIds.map(clientId=>syncClientDataSafely(clientId,"a bulk payment")));

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
      try{
        if(session.inTransaction())await session.abortTransaction();
      }catch(rollbackError){
        rollbackIncomplete=true;
        console.error("Bulk payment transaction rollback failed:",rollbackError);
      }
    }else if(savedAllocations.length){
      for(const item of savedAllocations.reverse()){
        let rolledBack=false;
        try{
          // Retry with the latest balance snapshot. The exact-match guard keeps
          // this compensating write from overwriting a concurrent payment's
          // derived totals.
          for(let attempt=0;attempt<5;attempt+=1){
            const current=await Order.findOne({
              _id:item.orderId,
              createdBy:item.createdBy,
              "payments._id":item.paymentId
            }).select("dueAmount").lean();
            if(!current){
              rolledBack=true;
              break;
            }

            const expectedDue=current.dueAmount===undefined
              ?{$exists:false}
              :current.dueAmount;
            const restored=await Order.findOneAndUpdate(
              {
                _id:item.orderId,
                createdBy:item.createdBy,
                "payments._id":item.paymentId,
                dueAmount:expectedDue
              },
              {$pull:{payments:{_id:item.paymentId}}},
              {new:true}
            );
            if(restored){
              rolledBack=true;
              break;
            }
          }
          if(!rolledBack){
            throw new Error("Invoice balance kept changing during payment rollback.");
          }
        }catch(rollbackError){
          rollbackIncomplete=true;
          console.error("Bulk payment rollback failed:",rollbackError);
        }
      }
    }
    if(!session&&reservedReferenceId&&!rollbackIncomplete){
      try{
        await releasePaymentReference({reservationId:reservedReferenceId,createdBy:req.user.id});
        reservedReferenceId=null;
      }catch(releaseError){
        rollbackIncomplete=true;
        console.error("Bulk payment reference rollback failed:",releaseError);
      }
    }
    console.error("Bulk payment error:",error);
    if(rollbackIncomplete){
      return res.status(500).json({
        success:false,
        message:"Bulk payment failed and automatic rollback could not be completed. Review the affected invoice payment histories before trying again."
      });
    }
    return res.status(error.status||400).json({success:false,message:error.message||"Unable to process bulk payment."});
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
