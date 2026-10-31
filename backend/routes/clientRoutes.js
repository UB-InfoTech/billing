const express=require("express");
const {applyWorkflows}=require("../utils/workflowEngine");
const mongoose=require("mongoose");
const Client=require("../models/Client");
const Order=require("../models/Order2");
const CreditNote=require("../models/CreditNote");
const Expense=require("../models/Expense");
const {buildClientCreditBalanceMutation}=require("../utils/clientCreditBalance");
const {assertClientIdentity,hasClientIdentity}=require("../utils/clientIdentity");
const {getInvoiceRevenue}=require("../utils/syncClientData");
const auth=require("../middleware/auth");
const {escapeRegex}=require("../utils/escapeRegex");

const router=express.Router();
const owner=req=>req.user.id;
const cleanCustomFields=value=>{
  if(!value||typeof value!=="object"||Array.isArray(value))return {};
  return Object.fromEntries(Object.entries(value).slice(0,100).map(([key,val])=>[String(key).slice(0,100),val]));
};

router.get("/summary",auth,async(req,res)=>{
  try{
    const uid=new mongoose.Types.ObjectId(owner(req));
    const [count,active,inactive,financial]=await Promise.all([
      Client.countDocuments({createdBy:uid}),
      Client.countDocuments({createdBy:uid,accountStatus:"Active"}),
      Client.countDocuments({createdBy:uid,accountStatus:"Inactive"}),
      Client.aggregate([{ $match:{createdBy:uid}},{$group:{_id:null,revenue:{$sum:"$totalRevenue"},paid:{$sum:"$totalPaid"},outstanding:{$sum:"$outstanding_balance"},averageOrderValue:{$avg:"$averageOrderValue"}}}])
    ]);
    res.json({count,active,inactive,totalRevenue:Number(financial[0]?.revenue||0),totalPaid:Number(financial[0]?.paid||0),outstanding_balance:Number(financial[0]?.outstanding||0),averageOrderValue:Number(financial[0]?.averageOrderValue||0)});
  }catch(error){res.status(500).json({message:error.message});}
});

router.get("/search",auth,async(req,res)=>{
  try{
    const query={createdBy:owner(req)};
    const q=String(req.query.q||req.query.name||"").trim();
    if(q){const rx=new RegExp(escapeRegex(q),"i");query.$or=[{name:rx},{companyName:rx},{email:rx},{phone:rx},{gstNumber:rx}];}
    if(req.query.businessType)query.businessType=req.query.businessType;
    if(req.query.accountStatus)query.accountStatus=req.query.accountStatus;
    const minRevenue=Number(req.query.minRevenue),maxRevenue=Number(req.query.maxRevenue);
    if(Number.isFinite(minRevenue)||Number.isFinite(maxRevenue)){query.totalRevenue={};if(Number.isFinite(minRevenue))query.totalRevenue.$gte=minRevenue;if(Number.isFinite(maxRevenue))query.totalRevenue.$lte=maxRevenue;}
    res.json(await Client.find(query).sort({companyName:1,name:1}).lean());
  }catch(error){res.status(500).json({message:error.message});}
});

router.get("/",auth,async(req,res)=>{
  try{
    const query={createdBy:owner(req)};
    if(req.query.businessType)query.businessType=req.query.businessType;
    if(req.query.accountStatus)query.accountStatus=req.query.accountStatus;
    const q=String(req.query.search||"").trim();
    if(q){const rx=new RegExp(escapeRegex(q),"i");query.$or=[{name:rx},{companyName:rx},{email:rx},{phone:rx},{gstNumber:rx}];}
    const minRevenue=Number(req.query.minRevenue),maxRevenue=Number(req.query.maxRevenue);
    if(Number.isFinite(minRevenue)||Number.isFinite(maxRevenue)){query.totalRevenue={};if(Number.isFinite(minRevenue))query.totalRevenue.$gte=minRevenue;if(Number.isFinite(maxRevenue))query.totalRevenue.$lte=maxRevenue;}
    const sortField=["name","companyName","totalRevenue","orderCount","lastOrderDate","createdAt"].includes(req.query.sort)?req.query.sort:"createdAt";
    const sortDir=req.query.order==="asc"?1:-1;
    res.json(await Client.find(query).sort({[sortField]:sortDir}).lean());
  }catch(error){res.status(500).json({message:error.message});}
});

router.get("/:id",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid client ID."});
    const client=await Client.findOne({_id:req.params.id,createdBy:owner(req)}).lean();
    if(!client)return res.status(404).json({message:"Client not found"});
    res.json(client);
  }catch(error){res.status(500).json({message:error.message});}
});

router.post("/",auth,async(req,res)=>{
  try{
    const input=req.body||{};
    // Only accept details a person may enter on the customer form. Financial
    // balances, payment history, order counts and ownership are maintained by
    // billing workflows and must never be set by a normal form request.
    const allowed=[
      "name","email","phone","address","state","city","pinCode","stateCode",
      "gstNumber","companyName","businessType","paymentTerms","discountRate",
      "accountStatus","notes","customFields"
    ];
    const body={};
    allowed.forEach(key=>{
      if(input[key]!==undefined)body[key]=input[key];
    });
    body.createdBy=owner(req);
    body.customFields=cleanCustomFields(body.customFields);
    if(body.gstNumber)body.gstNumber=String(body.gstNumber).trim().toUpperCase();
    const client=new Client(body);
    await applyWorkflows({resource:"clients",event:"record_created",doc:client,createdBy:owner(req)});
    assertClientIdentity(client);
    await client.save();
    res.status(201).json(client);
  }catch(error){res.status(400).json({message:error.message});}
});

router.patch("/:id",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid client ID."});
    const client=await Client.findOne({_id:req.params.id,createdBy:owner(req)});
    if(!client)return res.status(404).json({message:"Client not found"});
    const hadClientIdentity=hasClientIdentity(client);
    const allowed=["name","email","phone","address","state","city","pinCode","stateCode","gstNumber","companyName","businessType","paymentTerms","loyaltyPoints","discountRate","accountStatus","notes","customFields"];
    for(const key of allowed)if(req.body?.[key]!==undefined)client[key]=key==="customFields"?cleanCustomFields(req.body[key]):req.body[key];
    if(client.gstNumber)client.gstNumber=String(client.gstNumber).trim().toUpperCase();
    await applyWorkflows({resource:"clients",event:"record_updated",doc:client,createdBy:owner(req)});
    if(hadClientIdentity||req.body?.name!==undefined||req.body?.companyName!==undefined){
      assertClientIdentity(client);
    }
    await client.save();
    res.json(client);
  }catch(error){res.status(400).json({message:error.message});}
});

router.put("/:id/credit",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid client ID."});
    const amount=Number(req.body?.amount);
    if(!Number.isFinite(amount)||amount===0||Math.abs(amount)>100000000){
      return res.status(400).json({message:"Enter a valid non-zero credit adjustment."});
    }
    const client=await Client.findOne({_id:req.params.id,createdBy:owner(req)})
      .select("creditBalance creditBalanceAdjustment creditBalanceHistory createdBy +financialSummaryVersion")
      .lean();
    if(!client)return res.status(404).json({message:"Client not found"});

    let postedCredits=[];
    const hasStoredAdjustment=client.creditBalanceAdjustment!==undefined
      && client.creditBalanceAdjustment!==null
      && Number.isFinite(Number(client.creditBalanceAdjustment));
    if(!hasStoredAdjustment){
      postedCredits=await CreditNote.find({
        clientId:client._id,
        createdBy:owner(req),
        status:"Posted"
      }).select("settlement.customerCreditAmount").lean();
    }

    let mutation;
    try{
      mutation=buildClientCreditBalanceMutation({
        client,
        creditNotes:postedCredits,
        amount,
        adjustmentDelta:amount
      });
    }catch(error){
      return res.status(400).json({message:error.message});
    }

    // Save the signed manual adjustment and its resulting wallet balance in the
    // same atomic write as the balance itself, so statement history cannot drift.
    const reason=String(req.body?.reason||"Manual adjustment").trim().slice(0,160)||"Manual adjustment";
    mutation.update.$push={
      creditBalanceHistory:{
        amount:Math.round((amount+Number.EPSILON)*100)/100,
        balanceAfter:mutation.nextBalance,
        effectiveAt:new Date(),
        reason
      }
    };
    const updated=await Client.findOneAndUpdate(
      mutation.filter,
      mutation.update,
      {new:true,runValidators:true}
    );
    if(!updated){
      return res.status(409).json({message:"The customer balance changed. Refresh the customer and try again."});
    }
    return res.json(updated);
  }catch(error){res.status(400).json({message:error.message});}
});

router.get("/:id/transactions",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid client ID."});
    const client=await Client.findOne({_id:req.params.id,createdBy:owner(req)}).select("_id");
    if(!client)return res.status(404).json({message:"Client not found"});
    const orders=await Order.find({clientId:client._id,createdBy:owner(req)}).sort({orderDate:-1}).lean();
    const orderIds=orders.map(order=>order._id);
    const creditNotes=await CreditNote.find({
      createdBy:owner(req),
      $or:[
        {clientId:client._id},
        {originalOrderId:{$in:orderIds}}
      ]
    }).sort({creditNoteDate:-1,createdAt:-1}).lean();

    const transactions=[];
    for(const order of orders){
      transactions.push({type:"Invoice",orderId:order._id,orderNumber:order.orderNumber,date:order.orderDate,amount:getInvoiceRevenue(order),paid:Number(order.paidAmount||0),due:Number(order.dueAmount||0),status:order.paymentStatus,orderStatus:order.status});
      for(const payment of order.payments||[])transactions.push({type:"Payment",orderId:order._id,orderNumber:order.orderNumber,paymentId:payment._id,date:payment.paymentDate||payment.createdAt,amount:Number(payment.amount||0),method:payment.method,reference:payment.amountReference});
    }
    for(const creditNote of creditNotes){
      transactions.push({
        type:"Credit Note",
        creditNoteId:creditNote._id,
        creditNoteNumber:creditNote.creditNoteNumber,
        orderId:creditNote.originalOrderId,
        orderNumber:creditNote.originalInvoiceNumber,
        date:creditNote.creditNoteDate||creditNote.createdAt,
        amount:Number(creditNote.totals?.grandTotal||0),
        adjustmentAmount:Number(creditNote.settlement?.adjustmentAmount||0),
        refundAmount:Number(creditNote.settlement?.refundAmount||0),
        customerCreditAmount:Number(creditNote.settlement?.customerCreditAmount||0),
        status:creditNote.status,
        settlementStatus:creditNote.settlementStatus,
        cancelledAt:creditNote.cancelledAt||null,
        settlementHistory:Array.isArray(creditNote.settlementHistory)?creditNote.settlementHistory:[]
      });
    }
    res.json(transactions.sort((a,b)=>new Date(b.date)-new Date(a.date)));
  }catch(error){res.status(500).json({message:error.message});}
});

router.delete("/:id",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid client ID."});
    const linked=await Order.exists({clientId:req.params.id,createdBy:owner(req)});
    if(linked)return res.status(409).json({message:"Customer cannot be deleted because invoices are linked to it. Mark the customer Inactive instead."});
    const linkedCreditNote=await CreditNote.exists({clientId:req.params.id,createdBy:owner(req)});
    if(linkedCreditNote)return res.status(409).json({message:"Customer cannot be deleted because Credit Notes are linked to it. Keep the record for accounting history and mark it Inactive instead."});
    const linkedExpense=await Expense.exists({clientId:req.params.id,createdBy:owner(req)});
    if(linkedExpense)return res.status(409).json({message:"Customer cannot be deleted because expenses are linked to it. Keep the customer record for history and mark it Inactive instead."});
    const client=await Client.findOneAndDelete({_id:req.params.id,createdBy:owner(req)});
    if(!client)return res.status(404).json({message:"Client not found"});
    res.json({message:"Client deleted successfully"});
  }catch(error){res.status(500).json({message:error.message});}
});

module.exports=router;
