const express=require("express");
const {applyWorkflows}=require("../utils/workflowEngine");
const mongoose=require("mongoose");
const fs=require("fs");
const path=require("path");
const ejs=require("ejs");
const nodemailer=require("nodemailer");
const Order=require("../models/Order2");
const Profile=require("../models/Profile");
const Client=require("../models/Client");
const Product=require("../models/Product");
const CreditNote=require("../models/CreditNote");
const InvoiceConfiguration=require("../models/InvoiceConfiguration");
const PaymentLog=require("../models/PaymentLog2");
const auth=require("../middleware/auth");
const {syncClientDataSafely,getInvoiceRevenue}=require("../utils/syncClientData");
const {getCreditAppliedAmountAt}=require("../utils/creditNoteSettlementHistory");
const {sanitizeOrderCreateInput,cleanCustomFields}=require("../utils/orderInput");
const {loadConfiguredFormFields,calculateConfiguredCustomFields}=require("../utils/customFieldCalculations");
const {numberToWords}=require("../utils/numberToWords");
const {appendStatusTransition}=require("../utils/statusHistory");
const {hasInvoiceSensitiveChanges,wouldReduceTotalBelowApplied}=require("../utils/orderEditPolicy");
function buildInvoiceFinancialSnapshot(order={},invoiceTotal) {
  const total=invoiceTotal===undefined
    ?(order.roundOffFinalRevenue??order.totalAmount??order.finalRevenue??0)
    :invoiceTotal;
  return {
    invoiceTotal:Math.max(0,round2(total)),
    clientId:order.clientId?._id||order.clientId||null,
    orderDate:order.orderDate?new Date(order.orderDate):null,
    orderNumber:String(order.orderNumber||""),
    taxPercentage:round2(order.taxPercentage),
    discountRate:round2(order.discountRate)
  };
}
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

const ORDER_SAVE_GUARD_FIELDS=["updatedAt","dueAmount","paidAmount","creditAppliedAmount","creditNoteCount"];

// Guard document saves with the financial snapshot observed before editing.
// Payments and Credit Notes update these values atomically, so a stale form save
// must conflict instead of recalculating the due from old payment history.
function applyOrderSaveConcurrencyGuard(order,createdBy){
  const guard={createdBy};
  for(const field of ORDER_SAVE_GUARD_FIELDS){
    const defaulted=field!=="updatedAt"
      &&typeof order.$isDefault==="function"
      &&order.$isDefault(field);
    guard[field]=order[field]===undefined||defaulted
      ?{$exists:false}
      :order[field];
  }
  order.$where=guard;
}
const userId=req=>req.user.id;
const idOrNull=v=>v&&mongoose.isValidObjectId(v)?v:null;

function paymentAuditSnapshot(payment={}) {
  return {
    amount:round2(payment.amount),
    paymentDate:payment.paymentDate?new Date(payment.paymentDate):null,
    method:payment.method||"Cash",
    amountReference:String(payment.amountReference||""),
    processedBy:payment.processedBy||null
  };
}

async function validateProductReferences(items,createdBy){
  const productIds=[...new Set((Array.isArray(items)?items:[])
    .map(item=>String(item?.productId||"").trim())
    .filter(Boolean))];

  if(!productIds.length)return;
  if(productIds.some(id=>!mongoose.isValidObjectId(id))){
    const error=new Error("One of the selected products is invalid. Choose the product again.");
    error.status=400;
    throw error;
  }

  const products=await Product.find({
    _id:{$in:productIds},
    createdBy
  }).select("_id").lean();

  if(products.length!==productIds.length){
    const error=new Error("One of the selected products is unavailable in this business account. Remove it from the invoice or choose another product.");
    error.status=400;
    throw error;
  }
}

const { buildOrderDateRange } = require("../utils/orderDateRange");
const {escapeRegex}=require("../utils/escapeRegex");
const { normalizePaymentUpdates } = require("../utils/bulkPaymentAllocations");
const { buildPaymentAppendOperation } = require("../utils/paymentAppendOperation");
const { buildPaymentArrayMutationOperation } = require("../utils/paymentArrayMutation");
const { reservePaymentReference, ensurePaymentReferenceReserved, releasePaymentReference } = require("../utils/paymentReferenceReservation");
const { recordFinancialRecoveryIssue } = require("../utils/financialRecovery");

async function nextOrderNumber(uid){
  // Reserve the sequence in a single atomic database operation so concurrent
  // invoice requests cannot read and reuse the same next number.
  for(let attempt=0;attempt<100;attempt+=1){
    const profile=await Profile.findOneAndUpdate(
      {createdBy:String(uid)},
      [{
        $set:{
          billNoSequence:{
            $add:[
              {$max:[{$ifNull:["$billNoSequence",0]},1]},
              1
            ]
          },
          billNoPrefix:{$ifNull:["$billNoPrefix","INV-"]},
          billNoSuffix:{$ifNull:["$billNoSuffix",""]},
          createdBy:String(uid)
        }
      }],
      {new:true,upsert:true,returnDocument:"after"}
    );
    const sequence=Math.max(1,Number(profile.billNoSequence||2)-1);
    const number=String(profile.billNoPrefix||"INV-")+String(sequence).padStart(5,"0")+String(profile.billNoSuffix||"");
    if(!(await Order.exists({createdBy:uid,orderNumber:number})))return number;
  }
  throw new Error("Unable to reserve a unique invoice number. Check the bill numbering settings.");
}

router.get("/sales-analytics",auth,async(req,res)=>{
  try{
    const uid=new mongoose.Types.ObjectId(userId(req));
    const now=new Date();
    const startToday=new Date(now);startToday.setHours(0,0,0,0);
    const startTomorrow=new Date(startToday);startTomorrow.setDate(startTomorrow.getDate()+1);
    const startYesterday=new Date(startToday);startYesterday.setDate(startYesterday.getDate()-1);
    const startWeek=new Date(startToday);startWeek.setDate(startWeek.getDate()-startWeek.getDay());
    const startNextWeek=new Date(startWeek);startNextWeek.setDate(startNextWeek.getDate()+7);
    const startLastWeek=new Date(startWeek);startLastWeek.setDate(startLastWeek.getDate()-7);
    const startMonth=new Date(now.getFullYear(),now.getMonth(),1);
    const startNextMonth=new Date(now.getFullYear(),now.getMonth()+1,1);
    const startLastMonth=new Date(now.getFullYear(),now.getMonth()-1,1);
    const startYear=new Date(now.getFullYear(),0,1);
    const startNextYear=new Date(now.getFullYear()+1,0,1);
    const baseFilter={createdBy:uid,status:{$ne:"Cancelled"}};
    const inRange=(start,end)=>Order.find({...baseFilter,orderDate:{$gte:start,$lt:end}}).lean();
    const [today,thisWeek,thisMonth,thisYear,yesterday,lastWeek,lastMonth,byDay]=await Promise.all([
      inRange(startToday,startTomorrow),
      inRange(startWeek,startNextWeek),
      inRange(startMonth,startNextMonth),
      inRange(startYear,startNextYear),
      inRange(startYesterday,startToday),
      inRange(startLastWeek,startWeek),
      inRange(startLastMonth,startMonth),
      Order.aggregate([
        {$match:baseFilter},
        {$group:{
          _id:{$dateToString:{format:"%Y-%m-%d",date:"$orderDate"}},
          totalSales:{$sum:{$cond:[
            {$gt:[{$ifNull:["$roundOffFinalRevenue",0]},0]},
            "$roundOffFinalRevenue",
            {$cond:[
              {$gt:[{$ifNull:["$totalAmount",0]},0]},
              "$totalAmount",
              {$floor:{$add:[{$max:[{$ifNull:["$finalRevenue",0]},0]},0.5]}}
            ]}
          ]}},
          orderCount:{$sum:1}
        }},
        {$sort:{_id:1}}
      ])
    ]);
    const shape=orders=>({
      totalSales:round2(orders.reduce((sum,order)=>sum+getInvoiceRevenue(order),0)),
      orderCount:orders.length,
      orders:orders.map(order=>({...order,roundOffFinalRevenue:getInvoiceRevenue(order)}))
    });
    res.json({
      today:shape(today),yesterday:shape(yesterday),
      thisWeek:shape(thisWeek),lastWeek:shape(lastWeek),
      thisMonth:shape(thisMonth),lastMonth:shape(lastMonth),
      thisYear:shape(thisYear),dailyTrend:byDay
    });
  }catch(error){res.status(500).json({message:error.message});}
});

router.get("/all-orders",auth,async(req,res)=>{
  try{
    const orders=await Order.find({createdBy:userId(req)}).select("orderNumber companyName finalRevenue roundOffFinalRevenue totalAmount orderDate status Address State City dueAmount paidAmount paymentStatus clientId subOrders").sort({orderDate:-1}).lean();
    res.json(orders.map(order=>({...order,roundOffFinalRevenue:getInvoiceRevenue(order)})));
  }catch(error){res.status(500).json({message:error.message});}
});

router.post("/orders/create",auth,async(req,res)=>{
  try{
    // Do not accept payments, credit applications, stored totals, ownership,
    // or other system-maintained fields from the normal invoice form.
    const body=sanitizeOrderCreateInput(req.body);
    if(!Array.isArray(body.subOrders)||!body.subOrders.some(item=>String(item?.orderName||"").trim())){
      return res.status(400).json({success:false,message:"Add at least one product or service before saving the invoice."});
    }
    await validateProductReferences(body.subOrders,userId(req));
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
    body.orderNumber=await nextOrderNumber(userId(req));
    body.createdBy=userId(req);

    // Recalculate only user-created fields on the server. Built-in invoice and
    // item financial calculations remain governed by Order.calculateFinancials.
    const [orderFields,itemFields]=await Promise.all([
      loadConfiguredFormFields(userId(req),"orders.form"),
      loadConfiguredFormFields(userId(req),"orders.items")
    ]);
    body.customFields=calculateConfiguredCustomFields(
      orderFields,
      body,
      body.customFields
    );
    body.subOrders=body.subOrders.map(item=>({
      ...item,
      customFields:calculateConfiguredCustomFields(
        itemFields,
        item,
        item.customFields
      )
    }));

    const order=new Order(body);
    await applyWorkflows({resource:"orders",event:"record_created",doc:order,createdBy:userId(req)});
    const invoiceCreatedAt=new Date();
    order.financialHistory.push({
      eventType:"created",
      effectiveAt:order.orderDate||invoiceCreatedAt,
      recordedAt:invoiceCreatedAt,
      actor:userId(req),
      next:buildInvoiceFinancialSnapshot(order,Order.calculateFinancials(order).roundOffFinalRevenue)
    });
    await order.save();
    await syncClientDataSafely(order.clientId,"invoice creation",userId(req));
    res.status(201).json({success:true,order});
  }catch(error){res.status(400).json({success:false,message:error.message});}
});

router.get("/orders",auth,async(req,res)=>{
  try{
    const query={createdBy:userId(req)};
    const search=String(req.query.search||"").trim();
    if(search){const rx=new RegExp(escapeRegex(search),"i");query.$or=[{orderNumber:rx},{companyName:rx},{gstNumber:rx},{challanNumber:rx}];}
    if(req.query.status&&STATUSES.includes(req.query.status))query.status=req.query.status;
    if(req.query.paymentStatus&&["Unpaid","Partial","Paid"].includes(req.query.paymentStatus))query.paymentStatus=req.query.paymentStatus;
    if(idOrNull(req.query.clientId))query.clientId=req.query.clientId;
    const range=buildOrderDateRange(req.query);if(range)query.orderDate=range;
    const page=Math.max(parseInt(req.query.page,10)||1,1),limit=Math.min(Math.max(parseInt(req.query.limit,10)||100,1),200);
    const sortField=["orderDate","orderNumber","companyName","dueAmount","finalRevenue","createdAt"].includes(req.query.sort)?req.query.sort:"orderDate";
    const sortDir=req.query.order==="asc"?1:-1;
    const [orders,total]=await Promise.all([Order.find(query).sort({[sortField]:sortDir}).skip((page-1)*limit).limit(limit).lean(),Order.countDocuments(query)]);
    const normalizedOrders=orders.map(order=>({...order,roundOffFinalRevenue:getInvoiceRevenue(order)}));
    res.json({success:true,orders:normalizedOrders,pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))}});
  }catch(error){res.status(error.status||500).json({success:false,message:error.message});}
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
    const originalOrder=order.toObject({depopulate:true});
    const oldClient=String(order.clientId||"");
    const oldStatus=order.status;
    if(req.body?.status!==undefined&&!STATUSES.includes(req.body.status)){
      return res.status(400).json({message:"Invalid invoice status."});
    }
    if(req.body?.subOrders!==undefined&&(!Array.isArray(req.body.subOrders)||!req.body.subOrders.some(item=>String(item?.orderName||"").trim()))){
      return res.status(400).json({message:"Add at least one product or service before saving the invoice."});
    }
    if(req.body?.subOrders!==undefined){
      await validateProductReferences(req.body.subOrders,userId(req));
    }
    if(req.body?.orderNumber!==undefined){
      const requestedNumber=String(req.body.orderNumber||"").trim();
      if(!requestedNumber)return res.status(400).json({message:"Invoice number cannot be blank."});
      if(requestedNumber!==String(order.orderNumber||"")){
        const duplicate=await Order.exists({
          createdBy:userId(req),
          orderNumber:requestedNumber,
          _id:{$ne:order._id}
        });
        if(duplicate)return res.status(409).json({message:"That invoice number is already in use."});
        order.orderNumber=requestedNumber;
      }
    }
    const clientIdWasProvided=Object.prototype.hasOwnProperty.call(req.body||{},"clientId");
    let selectedClient=null;
    if(clientIdWasProvided){
      const requestedClientId=String(req.body.clientId||"").trim();
      if(requestedClientId){
        if(!mongoose.isValidObjectId(requestedClientId))return res.status(400).json({message:"Invalid customer selected."});
        selectedClient=await Client.findOne({_id:requestedClientId,createdBy:userId(req)}).lean();
        if(!selectedClient)return res.status(400).json({message:"Selected customer was not found in your account."});
      }
    }
    const allowed=["challanNumber","lrNo","orderDate","subOrders","Address","State","City","pinCode","stateCode","gstNumber","companyName","status","paymentTerms","taxPercentage","discountRate","note","customFields"];
    for(const key of allowed){
      if(req.body?.[key]===undefined)continue;
      if(key==="customFields"){
        order.customFields={
          ...cleanCustomFields(order.customFields),
          ...cleanCustomFields(req.body.customFields)
        };
      }else{
        order[key]=key==="customFields"?cleanCustomFields(req.body[key]):req.body[key];
      }
    }
    if(clientIdWasProvided){
      order.clientId=selectedClient?selectedClient._id:null;
      if(selectedClient&&String(selectedClient._id)!==oldClient){
        // Keep the invoice snapshot aligned when a different customer is linked.
        order.companyName=selectedClient.companyName||selectedClient.name||"";
        order.gstNumber=selectedClient.gstNumber||"";
        order.Address=selectedClient.address||"";
        order.State=selectedClient.state||"";
        order.City=selectedClient.city||"";
        order.pinCode=selectedClient.pinCode||"";
        order.stateCode=selectedClient.stateCode||"";
        order.paymentTerms=selectedClient.paymentTerms||order.paymentTerms||"30";
        order.discountRate=Number(selectedClient.discountRate??order.discountRate??0);
      }
    }
    const [orderFields,itemFields]=await Promise.all([
      loadConfiguredFormFields(userId(req),"orders.form"),
      loadConfiguredFormFields(userId(req),"orders.items")
    ]);
    order.customFields=calculateConfiguredCustomFields(
      orderFields,
      order.toObject({depopulate:true}),
      cleanCustomFields(order.customFields)
    );
    order.subOrders=order.subOrders.map(item=>{
      const itemValues=item.toObject({depopulate:true});
      return {
        ...itemValues,
        customFields:calculateConfiguredCustomFields(
          itemFields,
          itemValues,
          cleanCustomFields(item.customFields)
        )
      };
    });

    await applyWorkflows({resource:"orders",event:"record_updated",doc:order,createdBy:userId(req)});
    if(String(order.status||"")!==String(oldStatus||"")){
      order.statusHistory=appendStatusTransition(
        order.statusHistory,
        oldStatus,
        order.status,
        order.createdAt||order.orderDate||new Date(),
        new Date()
      );
    }
    const proposedOrder=order.toObject({depopulate:true});
    const invoiceSensitiveChanged=hasInvoiceSensitiveChanges(originalOrder,proposedOrder);

    if(invoiceSensitiveChanged){
      const hasPostedCreditNote=await CreditNote.exists({
        originalOrderId:order._id,
        createdBy:userId(req),
        status:"Posted"
      });
      if(hasPostedCreditNote){
        return res.status(409).json({
          success:false,
          message:"This invoice has a posted Credit Note. Its customer, invoice number, bill date, items, discount, tax and billing details cannot be changed. Cancel or reconcile the Credit Note first."
        });
      }

      const nextFinancials=Order.calculateFinancials(proposedOrder);
      const previousInvoiceTotal=getInvoiceRevenue(originalOrder);
      if(wouldReduceTotalBelowApplied(nextFinancials.roundOffFinalRevenue,previousInvoiceTotal,proposedOrder)){
        return res.status(409).json({
          success:false,
          message:"The revised invoice total cannot be lower than payments already received plus customer credit already applied. Keep the current total or record a separate refund/credit adjustment."
        });
      }

      const auditRecordedAt=new Date();
      order.financialHistory=Array.isArray(order.financialHistory)?order.financialHistory:[];
      order.financialHistory.push({
        eventType:"edited",
        effectiveAt:auditRecordedAt,
        recordedAt:auditRecordedAt,
        actor:userId(req),
        previous:buildInvoiceFinancialSnapshot(originalOrder,previousInvoiceTotal),
        next:buildInvoiceFinancialSnapshot(proposedOrder,nextFinancials.roundOffFinalRevenue),
        reconstructedBaseline:!Array.isArray(originalOrder.financialHistory)||originalOrder.financialHistory.length===0
      });
    }

    applyOrderSaveConcurrencyGuard(order,userId(req));
    await order.save();
    const newClient=String(order.clientId||"");
    if(oldClient)await syncClientDataSafely(oldClient,"invoice update",userId(req));if(newClient&&newClient!==oldClient)await syncClientDataSafely(newClient,"invoice update",userId(req));
    res.json({success:true,message:"Order updated successfully",order});
  }catch(error){
    const staleSave=error?.name==="DocumentNotFoundError"||error?.name==="VersionError";
    if(staleSave)console.error("Invoice update concurrency conflict:",error);
    return res.status(error.status||(staleSave?409:400)).json({
      success:false,
      message:staleSave
        ?"This invoice changed while you were editing it. Refresh the invoice and try again."
        :error.message
    });
  }
});

router.patch("/orders/:id/upd",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid order ID."});
    if(!STATUSES.includes(req.body?.status))return res.status(400).json({message:"Invalid order status."});
    const order=await Order.findOne({_id:req.params.id,createdBy:userId(req)});
    if(!order)return res.status(404).json({message:"Order not found"});
    // Making the same request twice is safe: don't create duplicate history rows.
    if(order.status===req.body.status){
      return res.json({message:"Order status is already up to date.",order});
    }
    order.status=req.body.status;
    order.statusHistory=Array.isArray(order.statusHistory)?order.statusHistory:[];
    order.statusHistory.push({status:req.body.status,timestamp:new Date()});
    await applyWorkflows({resource:"orders",event:"record_updated",doc:order,createdBy:userId(req)});
    applyOrderSaveConcurrencyGuard(order,userId(req));
    await order.save();
    await syncClientDataSafely(order.clientId,"an invoice status update",userId(req));
    return res.json({message:"Order status updated",order});
  }catch(error){
    const staleSave=error?.name==="DocumentNotFoundError"||error?.name==="VersionError";
    return res.status(error.status||(staleSave?409:400)).json({
      message:staleSave
        ?"This invoice changed while its status was being updated. Refresh the invoice and try again."
        :error.message
    });
  }
});

router.delete("/orders/:id/delete",auth,async(req,res)=>{
  try{
    const order=await Order.findOne({_id:req.params.id,createdBy:userId(req)});if(!order)return res.status(404).json({success:false,message:"Order not found"});
    if(Number(order.dueAmount||0)>0)return res.status(409).json({success:false,message:"This invoice still has an outstanding balance. Settle it or mark it cancelled instead."});
    if((order.payments||[]).length>0||Number(order.paidAmount||0)>0){
      return res.status(409).json({success:false,message:"This invoice has payment history and cannot be permanently deleted. Keep it for your records and change its status instead."});
    }
    if(Number(order.creditAppliedAmount||0)>0||Number(order.creditNoteCount||0)>0){
      return res.status(409).json({success:false,message:"This invoice has credit history and cannot be permanently deleted. Cancel or reconcile its Credit Notes first."});
    }
    const postedCredits=await CreditNote.countDocuments({originalOrderId:order._id,createdBy:userId(req),status:"Posted"});
    if(postedCredits>0)return res.status(409).json({message:"Cancel or reconcile posted Credit Notes before deleting this invoice."});
    await Order.deleteOne({_id:order._id,createdBy:userId(req)});
    await syncClientDataSafely(order.clientId,"invoice deletion",userId(req));
    res.json({success:true,message:"Invoice deleted successfully"});
  }catch(error){res.status(500).json({success:false,message:error.message});}
});

router.post("/orders/:id/pay",auth,async(req,res)=>{
  const transactional=isReplicaSetAvailable();
  const session=transactional?await mongoose.startSession():null;
  let reservedReferenceId=null;

  try{
    const uid=userId(req);
    const amount=round2(req.body?.amount);
    const method=req.body?.method||"Cash";
    const reference=String(req.body?.amountReference||"").trim();
    const paymentDate=new Date(req.body?.paymentDate||new Date());

    if(!uid)return res.status(401).json({success:false,message:"Authentication required."});
    if(!Number.isFinite(amount)||amount<=0)return res.status(400).json({success:false,message:"Payment amount must be a valid number greater than zero."});
    if(!METHODS.includes(method))return res.status(400).json({success:false,message:"Invalid payment method."});
    if(Number.isNaN(paymentDate.getTime()))return res.status(400).json({success:false,message:"Invalid payment date."});
    if(reference.length>100)return res.status(400).json({success:false,message:"Payment reference must be at most 100 characters."});

    if(session)session.startTransaction();

    const findOrder=Order.findOne({_id:req.params.id,createdBy:uid});
    if(session)findOrder.session(session);
    const order=await findOrder;
    if(!order)throw new Error("Order not found.");
    if(order.status==="Cancelled"){
      throw new Error("This invoice is cancelled. Change its status before recording another payment.");
    }

    if(Math.round(amount*100)>Math.round(Number(order.dueAmount||0)*100)){
      throw new Error(`Payment amount exceeds the current due balance of ₹${Number(order.dueAmount||0).toFixed(2)}.`);
    }

    if(reference){
      const duplicateOrderQuery=Order.exists({"payments.amountReference":reference,createdBy:uid});
      const duplicateLogQuery=PaymentLog.exists({userId:uid,reference});
      if(session){duplicateOrderQuery.session(session);duplicateLogQuery.session(session);}
      const [duplicateOrder,duplicateLog]=await Promise.all([duplicateOrderQuery,duplicateLogQuery]);
      if(duplicateOrder||duplicateLog){
        const error=new Error("Payment reference already exists. Use a different reference.");
        error.status=409;
        throw error;
      }
      reservedReferenceId=await reservePaymentReference({
        createdBy:uid,reference,kind:"single",session
      });
    }

    // The conditional write protects the balance observed above from concurrent
    // payments, credits, or invoice edits.
    const paymentId=new mongoose.Types.ObjectId();
    const paymentRecordedAt=new Date();
    const paymentData={
      _id:paymentId,
      amount,
      paymentDate,
      createdAt:paymentRecordedAt,
      method,
      amountReference:reference,
      processedBy:uid
    };
    const paymentHistoryEvent={
      action:"added",
      paymentId,
      effectiveAt:paymentDate,
      recordedAt:paymentRecordedAt,
      actor:uid,
      after:paymentAuditSnapshot(paymentData)
    };
    const paymentOperation=buildPaymentAppendOperation({
      orderId:order._id,
      createdBy:uid,
      amount,
      expectedDueAmount:Number(order.dueAmount||0),
      payment:paymentData,
      paymentDate,
      paymentHistoryEvent
    });
    const paymentUpdate=Order.findOneAndUpdate(
      paymentOperation.filter,
      paymentOperation.update,
      paymentOperation.options
    );
    if(session)paymentUpdate.session(session);
    const updatedOrder=await paymentUpdate;
    if(!updatedOrder){
      const conflict=new Error("The invoice balance changed while you were recording this payment. Refresh the invoice and try again.");
      conflict.status=409;
      throw conflict;
    }

    if(session)await session.commitTransaction();
    reservedReferenceId=null;
    await syncClientDataSafely(updatedOrder.clientId,"a single-invoice payment",userId(req));

    return res.json({success:true,message:"Payment recorded successfully.",order:updatedOrder});
  }catch(error){
    if(session){
      try{if(session.inTransaction())await session.abortTransaction();}catch{}
    }else if(reservedReferenceId){
      try{await releasePaymentReference({reservationId:reservedReferenceId,createdBy:userId(req)});}
      catch(releaseError){console.error("Payment reference rollback failed:",releaseError);}
    }
    console.error("Payment create error:",error);
    return res.status(error.status||(error.code===11000?409:400)).json({
      success:false,
      message:error.message||"Unable to record payment."
    });
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
  let newlyReservedReferenceId=null;

  try{
    const uid=userId(req);
    if(!mongoose.isValidObjectId(req.params.orderId)||!mongoose.isValidObjectId(req.params.paymentId)){
      return res.status(400).json({success:false,message:"Invalid invoice or payment ID."});
    }

    const amount=round2(req.body?.amount);
    const method=req.body?.method||"Cash";
    const reference=String(req.body?.amountReference||"").trim();
    const paymentDate=new Date(req.body?.paymentDate||new Date());

    if(!Number.isFinite(amount)||amount<=0)return res.status(400).json({success:false,message:"Payment amount must be a valid number greater than zero."});
    if(!METHODS.includes(method))return res.status(400).json({success:false,message:"Invalid payment method."});
    if(Number.isNaN(paymentDate.getTime()))return res.status(400).json({success:false,message:"Invalid payment date."});
    if(reference.length>100)return res.status(400).json({success:false,message:"Payment reference must be at most 100 characters."});

    if(session)session.startTransaction();

    const findOrder=Order.findOne({_id:req.params.orderId,createdBy:uid}).lean();
    if(session)findOrder.session(session);
    const order=await findOrder;
    if(!order){const error=new Error("Invoice not found.");error.status=404;throw error;}

    const currentPayments=Array.isArray(order.payments)?order.payments:[];
    const paymentIndex=currentPayments.findIndex(item=>String(item?._id)===String(req.params.paymentId));
    if(paymentIndex<0){const error=new Error("Payment not found.");error.status=404;throw error;}
    const currentPayment=currentPayments[paymentIndex];
    const currentReference=String(currentPayment.amountReference||"").trim();

    const available=Number(order.dueAmount||0)+Number(currentPayment.amount||0);
    if(Math.round(amount*100)>Math.round(available*100)){
      throw new Error("Payment amount exceeds the available invoice balance.");
    }

    // One bulk-payment reference intentionally appears on several invoices.
    // Only a changed reference needs a duplicate check against other allocations.
    if(reference&&reference!==currentReference){
      const duplicateOrderQuery=Order.exists({
        createdBy:uid,
        "payments.amountReference":reference,
        $or:[
          {_id:{$ne:order._id}},
          {_id:order._id,payments:{$elemMatch:{_id:{$ne:currentPayment._id},amountReference:reference}}}
        ]
      });
      const duplicateLogQuery=PaymentLog.exists({userId:uid,reference});
      if(session){duplicateOrderQuery.session(session);duplicateLogQuery.session(session);}
      const [duplicateOrder,duplicateLog]=await Promise.all([duplicateOrderQuery,duplicateLogQuery]);
      if(duplicateOrder||duplicateLog){
        const error=new Error("Payment reference already exists. Use a different reference.");
        error.status=409;
        throw error;
      }
      newlyReservedReferenceId=await reservePaymentReference({
        createdBy:uid,reference,kind:"single",session
      });
    }

    // Preserve old references in the ledger too, including records created
    // before reference reservations were introduced.
    if(currentReference){
      await ensurePaymentReferenceReserved({
        createdBy:uid,reference:currentReference,kind:"historical",session
      });
    }

    const nextPayments=currentPayments.map((item,index)=>index===paymentIndex?{
      ...item,
      amount,
      method,
      amountReference:reference,
      paymentDate
    }:item);
    const nextPayment=nextPayments[paymentIndex];
    const paymentRecordedAt=new Date();
    const paymentHistoryEvent={
      action:"edited",
      paymentId:currentPayment._id,
      effectiveAt:paymentRecordedAt,
      recordedAt:paymentRecordedAt,
      actor:uid,
      before:paymentAuditSnapshot(currentPayment),
      after:paymentAuditSnapshot(nextPayment)
    };
    const wasLastRecordedPayment=paymentIndex===currentPayments.length-1;
    const lastPaymentDate=wasLastRecordedPayment?paymentDate:(order.lastPaymentDate||null);
    const operation=buildPaymentArrayMutationOperation({
      orderId:order._id,
      createdBy:uid,
      expectedDueAmount:order.dueAmount,
      expectedPayments:order.payments,
      expectedUpdatedAt:order.updatedAt,
      nextPayments,
      lastPaymentDate,
      paymentHistoryEvent
    });
    const updateQuery=Order.findOneAndUpdate(operation.filter,operation.update,operation.options);
    if(session)updateQuery.session(session);
    const updatedOrder=await updateQuery;
    if(!updatedOrder){
      const conflict=new Error("This invoice changed while you were editing the payment. Refresh it and try again.");
      conflict.status=409;
      throw conflict;
    }

    if(session)await session.commitTransaction();
    newlyReservedReferenceId=null;
    await syncClientDataSafely(updatedOrder.clientId,"a payment edit",userId(req));
    return res.json({success:true,message:"Payment updated successfully.",order:updatedOrder});
  }catch(error){
    if(session){
      try{if(session.inTransaction())await session.abortTransaction();}catch{}
    }else if(newlyReservedReferenceId){
      try{await releasePaymentReference({reservationId:newlyReservedReferenceId,createdBy:userId(req)});}
      catch(releaseError){console.error("Payment reference rollback failed:",releaseError);}
    }
    console.error("Payment update error:",error);
    return res.status(error.status||(error.code===11000?409:400)).json({
      success:false,message:error.message||"Unable to update payment."
    });
  }finally{
    if(session)await session.endSession();
  }
});

router.delete("/orders/:orderId/payments/:paymentId",auth,async(req,res)=>{
  const transactional=isReplicaSetAvailable();
  const session=transactional?await mongoose.startSession():null;

  try{
    const uid=userId(req);
    if(!mongoose.isValidObjectId(req.params.orderId)||!mongoose.isValidObjectId(req.params.paymentId)){
      return res.status(400).json({success:false,message:"Invalid invoice or payment ID."});
    }

    if(session)session.startTransaction();

    const findOrder=Order.findOne({_id:req.params.orderId,createdBy:uid}).lean();
    if(session)findOrder.session(session);
    const order=await findOrder;
    if(!order){const error=new Error("Invoice not found.");error.status=404;throw error;}

    const currentPayments=Array.isArray(order.payments)?order.payments:[];
    const paymentIndex=currentPayments.findIndex(item=>String(item?._id)===String(req.params.paymentId));
    if(paymentIndex<0){const error=new Error("Payment not found.");error.status=404;throw error;}
    const currentPayment=currentPayments[paymentIndex];
    const currentReference=String(currentPayment.amountReference||"").trim();
    if(currentReference){
      await ensurePaymentReferenceReserved({
        createdBy:uid,reference:currentReference,kind:"historical",session
      });
    }

    const nextPayments=currentPayments.filter((_,index)=>index!==paymentIndex);
    const paymentRecordedAt=new Date();
    const paymentHistoryEvent={
      action:"deleted",
      paymentId:currentPayment._id,
      effectiveAt:paymentRecordedAt,
      recordedAt:paymentRecordedAt,
      actor:uid,
      before:paymentAuditSnapshot(currentPayment)
    };
    const wasLastRecordedPayment=paymentIndex===currentPayments.length-1;
    const remainingLastPayment=nextPayments[nextPayments.length-1];
    const lastPaymentDate=wasLastRecordedPayment
      ?(remainingLastPayment?.paymentDate||remainingLastPayment?.createdAt||null)
      :(order.lastPaymentDate||null);

    const operation=buildPaymentArrayMutationOperation({
      orderId:order._id,
      createdBy:uid,
      expectedDueAmount:order.dueAmount,
      expectedPayments:order.payments,
      expectedUpdatedAt:order.updatedAt,
      nextPayments,
      lastPaymentDate,
      paymentHistoryEvent
    });
    const updateQuery=Order.findOneAndUpdate(operation.filter,operation.update,operation.options);
    if(session)updateQuery.session(session);
    const updatedOrder=await updateQuery;
    if(!updatedOrder){
      const conflict=new Error("This invoice changed while you were deleting the payment. Refresh it and try again.");
      conflict.status=409;
      throw conflict;
    }

    if(session)await session.commitTransaction();
    await syncClientDataSafely(updatedOrder.clientId,"a payment deletion",userId(req));
    return res.json({success:true,message:"Payment deleted successfully.",order:updatedOrder});
  }catch(error){
    if(session){
      try{if(session.inTransaction())await session.abortTransaction();}catch{}
    }
    console.error("Payment delete error:",error);
    return res.status(error.status||(error.code===11000?409:400)).json({
      success:false,message:error.message||"Unable to delete payment."
    });
  }finally{
    if(session)await session.endSession();
  }
});

router.put("/orders/payments/bulk",auth,async(req,res)=>{
  const transactional=isReplicaSetAvailable();
  const session=transactional?await mongoose.startSession():null;
  const savedAllocations=[];
  const rollbackFailures=[];
  let rollbackIncomplete=false;
  let reservedReferenceId=null;

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

    const normalized=normalizePaymentUpdates(
      updates,
      value=>mongoose.isValidObjectId(value)
    );
    const byId=new Map(normalized.map(item=>[item.orderId,item.amount]));
    const ids=normalized.map(item=>item.orderId);

    if(session)session.startTransaction({writeConcern:{w:"majority",j:true}});

    const duplicateOrderQuery=Order.exists({"payments.amountReference":reference,createdBy:userId(req)});
    const duplicateLogQuery=PaymentLog.exists({userId:userId(req),reference});
    if(session){duplicateOrderQuery.session(session);duplicateLogQuery.session(session);}
    const [duplicateOrder,duplicateLog]=await Promise.all([duplicateOrderQuery,duplicateLogQuery]);
    if(duplicateOrder||duplicateLog){
      const conflict=new Error("Payment reference already exists. Use a different reference.");
      conflict.status=409;
      throw conflict;
    }
    reservedReferenceId=await reservePaymentReference({
      createdBy:userId(req),reference,kind:"bulk",session
    });

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
      const paymentId=new mongoose.Types.ObjectId();
      const paymentRecordedAt=new Date();
      const paymentData={
        _id:paymentId,
        amount:item.appliedAmount,
        paymentDate:parsedDate,
        createdAt:paymentRecordedAt,
        method,
        amountReference:reference,
        processedBy:userId(req)
      };
      const paymentHistoryEvent={
        action:"added",
        paymentId,
        effectiveAt:parsedDate,
        recordedAt:paymentRecordedAt,
        actor:userId(req),
        after:paymentAuditSnapshot(paymentData)
      };
      const operation=buildPaymentAppendOperation({
        orderId:item.order._id,
        createdBy:userId(req),
        amount:item.appliedAmount,
        expectedDueAmount:Number(item.order.dueAmount||0),
        payment:paymentData,
        paymentDate:parsedDate,
        paymentHistoryEvent
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
        createdBy:userId(req),
        paymentId:payment?._id
      });
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
    reservedReferenceId=null;

    const clientIds=[...new Set(allocations.map(item=>String(item.order.clientId||"")).filter(Boolean))];
    await Promise.allSettled(clientIds.map(clientId=>syncClientDataSafely(clientId,"a bulk payment",userId(req))));

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
        rollbackFailures.push({step:"abort-transaction",message:String(rollbackError?.message||rollbackError)});
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
              {$pull:{payments:{_id:item.paymentId},paymentHistory:{paymentId:item.paymentId}}},
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
          rollbackFailures.push({step:"remove-invoice-payment",entityType:"invoice",entityId:String(item.orderId||""),message:String(rollbackError?.message||rollbackError)});
          console.error("Bulk payment rollback failed:",rollbackError);
        }
      }
    }
    if(!session&&reservedReferenceId&&!rollbackIncomplete){
      try{
        await releasePaymentReference({reservationId:reservedReferenceId,createdBy:userId(req)});
        reservedReferenceId=null;
      }catch(releaseError){
        rollbackIncomplete=true;
        rollbackFailures.push({step:"release-payment-reference",message:String(releaseError?.message||releaseError)});
        console.error("Bulk payment reference rollback failed:",releaseError);
      }
    }
    console.error("Bulk payment error:",error);
    if(rollbackIncomplete){
      await recordFinancialRecoveryIssue({
        createdBy:userId(req),
        operation:"bulk-payment",
        summary:"Bulk payment failed and one or more compensation steps did not complete.",
        originalError:error?.message||error,
        invoiceIds:savedAllocations.map(item=>item.orderId),
        recoveryFailures:rollbackFailures
      });
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

function referenceAllowed(value){const x=String(value||"").trim();return x.length>0&&x.length<=100;}

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

  const invoiceTotal=getInvoiceRevenue(order);
  const calculatedFinalRevenue=Number(order.finalRevenue);
  const roundOff=Number.isFinite(calculatedFinalRevenue)&&calculatedFinalRevenue>0
    ?round2(invoiceTotal-calculatedFinalRevenue)
    :Number(order.roundOff||0);
  const rows=(order.subOrders||[]).map((item,index)=>{
    const qtyUnit=item.qtyUnit||"PCS";
    const enteredQty=qtyUnit==="MTR"?Number(item.MTR||0):Number(item.quantity||0);
    const billableQty=Math.max(0,enteredQty-Math.max(0,Number(item.shortPcs||0)));
    const amount=round2(billableQty*Number(item.unitPrice||0));
    return `<tr>
      <td>${index+1}</td>
      <td>${invoiceEscape(item.orderName||"")}</td>
      <td>${invoiceEscape(item.designNumber||"")}</td>
      <td>${invoiceEscape(item.hsnCode??"")}</td>
      <td>${billableQty.toFixed(2)} ${invoiceEscape(qtyUnit)}</td>
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
  <div class="summary"><div><span>Subtotal</span><span>₹${round2(Number(order.totalCost||0)+Number(order.discountAmount||0)).toFixed(2)}</span></div><div><span>Discount</span><span>-₹${Number(order.discountAmount||0).toFixed(2)}</span></div><div><span>Taxable</span><span>₹${Number(order.totalCost||0).toFixed(2)}</span></div><div><span>Tax</span><span>₹${Number(order.taxAmount||0).toFixed(2)}</span></div><div><span>Round Off</span><span>₹${roundOff.toFixed(2)}</span></div><div style="border-top:2px solid #111;font-weight:700"><span>Invoice Total</span><span>₹${invoiceTotal.toFixed(2)}</span></div></div>
  <div style="margin-top:28px;border-top:1px solid #999;padding-top:10px;font-size:12px">Payment Status: ${invoiceEscape(order.paymentStatus||"Unpaid")} &nbsp; | &nbsp; Paid: ₹${Number(order.paidAmount||0).toFixed(2)} &nbsp; | &nbsp; Due: ₹${Number(order.dueAmount||0).toFixed(2)}</div>
  </div></body></html>`;
}

const defaultInvoiceConfiguration=()=>({
  pageSize:"A4",
  accentColor:"#111827",
  invoiceTitle:"TAX INVOICE",
  header:{showHeaderTitle:true,showCompanyName:true,showGST:true,showPhones:true,showAddress:true},
  receiver:{showName:true,showAddress:true,showMobile:true,showState:true,showGSTIN:true},
  invoiceDetails:{showChallan:true,showInvoiceNo:true,showInvoiceDate:true,showDueDate:true,showPaymentTerms:true,showEwayBill:true},
  itemColumns:[
    {key:"sr",label:"Sr",visible:true,order:0,width:5},{key:"description",label:"Desc.",visible:true,order:1,width:17},
    {key:"designNumber",label:"Design No.",visible:true,order:2,width:13},{key:"hsnCode",label:"HSN",visible:true,order:3,width:9},
    {key:"quantity",label:"Qty",visible:true,order:4,width:8},{key:"qtyUnit",label:"Unit",visible:true,order:5,width:5},
    {key:"cut",label:"Cut",visible:true,order:6,width:7},{key:"MTR",label:"MTR",visible:true,order:7,width:7},
    {key:"unitPrice",label:"Rate",visible:true,order:8,width:8},{key:"amount",label:"Amount",visible:true,order:9,width:8},
    {key:"discount",label:"Disc.",visible:true,order:10,width:7},{key:"taxable",label:"Taxable",visible:true,order:11,width:12}
  ],
  summary:{showDiscount:true,showTax:true,showRoundOff:true,showBankDetails:true,showTerms:true,showWebCredit:true}
});

async function renderInvoice(order,res){
  const profile=await Profile.findOne({createdBy:String(order.createdBy)}).lean()||{};
  const invoiceConfig=await InvoiceConfiguration.findOne({createdBy:String(order.createdBy)}).lean()||defaultInvoiceConfiguration();
  const client=order.clientId?await Client.findOne({_id:order.clientId,createdBy:String(order.createdBy)}).lean():null;
  const dueDate=new Date(order.orderDate||new Date());
  const terms=Number(order.paymentTerms);
  if(Number.isFinite(terms))dueDate.setDate(dueDate.getDate()+terms);

  try{
    const html=await ejs.renderFile(path.join(__dirname,"../public/invoiceTable.ejs"),{
      invoiceConfig,
      profileHeaderTitle:profile.headerTitle||"Invoice",profileCompanyName:profile.companyName||"Company",profileCompanyAddress:profile.companyAddress||"",profilePhoneNumber1:profile.phoneNumber1||"",profilePhoneNumber2:profile.phoneNumber2||"",profileGstNumber:profile.gstin||"",profilePanNumber:profile.pan||"",profileBankName:profile.bankName||"",profileAccountNo:profile.accountNo||"",profileBranchName:profile.branchName||"",profileIfsc:profile.ifsc||"",
      clientChallanNumber:order.challanNumber||"",clientCompanyName:order.companyName||"",clientAddress:order.Address||"",clientPhoneNumber:client?.phone||"",clientGstNumber:order.gstNumber||"",clientState:client?.state||order.State||"",
      orderNumber:order.orderNumber||"",createdAt:new Date(order.orderDate).toLocaleDateString("en-IN"),dueDate:dueDate.toLocaleDateString("en-IN"),paymentTerm:order.paymentTerms||"",ewayBillNo:order.ewbDetails?.ewbNo||"N/A",subOrders:order.subOrders||[],orderTotalCost:order.totalCost||0,orderSubTotal:round2(Number(order.totalCost||0)+Number(order.discountAmount||0)),orderDisRate:order.discountRate||0,orderDiscountAmount:order.discountAmount||0,orderTax:round2(Number(order.taxPercentage||0)/2),orderTaxAmount:round2(Number(order.taxAmount||0)/2),orderIgstTax:Number(order.stateCode)!==Number(profile.stateCode)?Number(order.taxPercentage||0):0,orderIgstTaxAmount:Number(order.stateCode)!==Number(profile.stateCode)?Number(order.taxAmount||0):0,orderFinalRevenue:order.finalRevenue||0,orderFinalRevenueRoundOff:round2(getInvoiceRevenue(order)-Number(order.finalRevenue||0)),orderFinalRevenueAfterRoundOff:getInvoiceRevenue(order),orderFinalRevenueInWords:numberToWords(getInvoiceRevenue(order)),paymentStatus:order.paymentStatus,dueAmount:order.dueAmount||0,creditAppliedAmount:order.creditAppliedAmount||0,payments:order.payments||[]
    });
    return res.type("html").send(html);
  }catch(error){
    console.error("Invoice template render failed; using simple fallback:",error);
    return res.type("html").send(renderSimpleInvoiceHtml({order,profile,client}));
  }
}

router.get("/:orderId/invoice",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.orderId))return res.status(400).json({message:"Invalid invoice ID."});
    const order=await Order.findOne({_id:req.params.orderId,createdBy:userId(req)}).lean();
    if(!order)return res.status(404).json({message:"Order not found"});
    await renderInvoice(order,res);
  }catch(error){res.status(500).json({message:"Error generating invoice",error:error.message});}
});
router.get("/:orderId/KachuBill",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.orderId))return res.status(400).json({message:"Invalid invoice ID."});
    const order=await Order.findOne({_id:req.params.orderId,createdBy:userId(req)}).lean();
    if(!order)return res.status(404).json({message:"Order not found"});
    await renderInvoice(order,res);
  }catch(error){res.status(500).json({message:"Error generating bill",error:error.message});}
});

router.get("/:orderId/payments/:paymentId/invoice",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.orderId))return res.status(400).json({message:"Invalid invoice ID."});
    const order=await Order.findOne({_id:req.params.orderId,createdBy:userId(req)}).lean();
    if(!order)return res.status(404).json({message:"Order not found"});

    const payment=(order.payments||[]).find(p=>String(p._id)===String(req.params.paymentId));
    if(!payment)return res.status(404).json({message:"Payment not found"});

    const profile=await Profile.findOne({createdBy:String(req.user.id)}).lean()||{};
    const client=order.clientId
      ? await Client.findOne({_id:order.clientId,createdBy:userId(req)}).lean()
      : null;

    const paymentAmount=Number(payment.amount||0);
    const invoiceTotal=getInvoiceRevenue(order);
    const paymentDate=new Date(payment.paymentDate||payment.createdAt||new Date());
    const creditNotes=await CreditNote.find({
      originalOrderId:order._id,
      createdBy:userId(req)
    }).select("settlement settlementHistory creditNoteDate createdAt updatedAt status cancelledAt").lean();
    const historicalCredit=getCreditAppliedAmountAt(creditNotes,paymentDate);
    const creditApplied=historicalCredit.reliable
      ? historicalCredit.amount
      : Math.max(0,Number(order.creditAppliedAmount||0));
    const creditHistoryWarning=historicalCredit.reliable
      ? ""
      : "Some older Credit Notes may have been edited before settlement history was recorded. Previous due and remaining due are estimates; reconcile them against the invoice and Credit Note records.";
    const paymentTimeline=(order.payments||[]).map((entry,index)=>{
      const parsedDate=new Date(entry.paymentDate||entry.createdAt||0).getTime();
      return {entry,index,time:Number.isFinite(parsedDate)?parsedDate:Number.MAX_SAFE_INTEGER};
    }).sort((left,right)=>left.time-right.time||left.index-right.index);
    const paymentPosition=paymentTimeline.findIndex(item=>String(item.entry._id)===String(payment._id));
    const paidBefore=paymentTimeline
      .slice(0,Math.max(0,paymentPosition))
      .reduce((sum,item)=>sum+Math.max(0,Number(item.entry.amount||0)),0);
    const previousDue=Math.max(0,round2(invoiceTotal-paidBefore-creditApplied));
    const balanceAfter=Math.max(0,round2(previousDue-paymentAmount));
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
      VcreditHistoryWarning:creditHistoryWarning,
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