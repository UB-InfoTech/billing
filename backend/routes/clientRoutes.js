const express=require("express");
const {applyWorkflows}=require("../utils/workflowEngine");
const mongoose=require("mongoose");
const Client=require("../models/Client");
const Order=require("../models/Order2");
const CreditNote=require("../models/CreditNote");
const ClientActivity=require("../models/ClientActivity");
const {buildClientActivityTimeline}=require("../utils/clientActivityTimeline");
const Expense=require("../models/Expense");
const CalendarEvent=require("../models/Calendar");
const {buildClientCreditBalanceMutation}=require("../utils/clientCreditBalance");
const {assertClientIdentity,hasClientIdentity}=require("../utils/clientIdentity");
const {getInvoiceRevenue}=require("../utils/syncClientData");
const {buildCustomerStatement}=require("../utils/customerStatement");
const auth=require("../middleware/auth");
const {escapeRegex}=require("../utils/escapeRegex");
const {loadConfiguredFormFields,calculateConfiguredCustomFields,hasConfiguredCustomCalculations}=require("../utils/customFieldCalculations");
const {prepareConfiguredFormValues,validateConfiguredFormValues}=require("../utils/configuredFormValidation");

const router=express.Router();
const owner=req=>req.user.id;
const cleanCustomFields=value=>{
  if(value instanceof Map||value?.$isMongooseMap===true||(typeof value?.entries==="function"&&typeof value?.get==="function"))return Object.fromEntries([...value.entries()].slice(0,100).map(([key,val])=>[String(key).slice(0,100),val]));
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
    const clients=await Client.find(query).sort({companyName:1,name:1}).lean();
    if(!clients.length)return res.json([]);
    const clientIds=clients.map(client=>client._id);
    const ownerId=new mongoose.Types.ObjectId(owner(req));
    const [lastActivities,openFollowUps,nextFollowUps]=await Promise.all([
      ClientActivity.aggregate([
        {$match:{createdBy:ownerId,clientId:{$in:clientIds}}},
        {$group:{_id:"$clientId",lastCrmActivityAt:{$max:"$occurredAt"}}}
      ]),
      ClientActivity.aggregate([
        {$match:{createdBy:ownerId,clientId:{$in:clientIds},type:{$in:["task","follow_up"]},status:"open"}},
        {$group:{_id:"$clientId",openFollowUpCount:{$sum:1}}}
      ]),
      ClientActivity.aggregate([
        {$match:{createdBy:ownerId,clientId:{$in:clientIds},type:{$in:["task","follow_up"]},status:"open",dueAt:{$ne:null}}},
        {$group:{_id:"$clientId",nextFollowUpAt:{$min:"$dueAt"}}}
      ])
    ]);
    const lastByClient=new Map(lastActivities.map(item=>[String(item._id),item.lastCrmActivityAt]));
    const openByClient=new Map(openFollowUps.map(item=>[String(item._id),item.openFollowUpCount]));
    const nextByClient=new Map(nextFollowUps.map(item=>[String(item._id),item.nextFollowUpAt]));
    return res.json(clients.map(client=>({
      ...client,
      lastCrmActivityAt:lastByClient.get(String(client._id))||null,
      nextFollowUpAt:nextByClient.get(String(client._id))||null,
      openFollowUpCount:openByClient.get(String(client._id))||0
    })));
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

router.get("/follow-ups",auth,async(req,res)=>{
  try{
    const ownerId=new mongoose.Types.ObjectId(owner(req));
    const status=String(req.query.status||"open");
    if(!["open","completed","all"].includes(status))return res.status(400).json({message:"Choose a valid follow-up status."});
    const bucket=String(req.query.bucket||"all");
    if(!["all","overdue","today","upcoming","no_date"].includes(bucket))return res.status(400).json({message:"Choose a valid follow-up filter."});
    const page=Math.max(1,Math.floor(Number(req.query.page)||1));
    const limit=Math.min(100,Math.max(1,Math.floor(Number(req.query.limit)||25)));
    const todayStart=req.query.todayStart?new Date(req.query.todayStart):null;
    const tomorrowStart=req.query.tomorrowStart?new Date(req.query.tomorrowStart):null;
    if((todayStart&&!Number.isFinite(todayStart.getTime()))||(tomorrowStart&&!Number.isFinite(tomorrowStart.getTime()))){
      return res.status(400).json({message:"The follow-up date range is invalid."});
    }
    const start=todayStart||new Date(new Date().setHours(0,0,0,0));
    const end=tomorrowStart||new Date(start.getTime()+24*60*60*1000);
    const base={createdBy:ownerId,type:{$in:["task","follow_up"]}};
    if(status!=="all")base.status=status;
    if(bucket!=="all"){
      if(status==="completed")return res.status(400).json({message:"Date filters are available for open follow-ups."});
      if(bucket==="overdue")base.dueAt={$ne:null,$lt:start};
      if(bucket==="today")base.dueAt={$gte:start,$lt:end};
      if(bucket==="upcoming")base.dueAt={$gte:end};
      if(bucket==="no_date")base.dueAt=null;
    }
    const search=String(req.query.search||"").trim().slice(0,100);
    if(search){
      const rx=new RegExp(escapeRegex(search),"i");
      const matchingClients=await Client.find({
        createdBy:owner(req),
        $or:[{companyName:rx},{name:rx},{phone:rx},{email:rx}]
      }).select("_id").limit(500).lean();
      const alternatives=[{subject:rx},{description:rx}];
      if(matchingClients.length)alternatives.push({clientId:{$in:matchingClients.map(client=>client._id)}});
      base.$or=alternatives;
    }
    const [total,records,openCount,overdueCount,todayCount,upcomingCount,noDateCount,completedCount]=await Promise.all([
      ClientActivity.countDocuments(base),
      ClientActivity.aggregate([
        {$match:base},
        {$addFields:{dueOrder:{$cond:[{$ifNull:["$dueAt",false]},0,1]}}},
        {$sort:{dueOrder:1,dueAt:1,createdAt:-1}},
        {$skip:(page-1)*limit},
        {$limit:limit},
        {$project:{dueOrder:0}}
      ]),
      ClientActivity.countDocuments({createdBy:ownerId,type:{$in:["task","follow_up"]},status:"open"}),
      ClientActivity.countDocuments({createdBy:ownerId,type:{$in:["task","follow_up"]},status:"open",dueAt:{$ne:null,$lt:start}}),
      ClientActivity.countDocuments({createdBy:ownerId,type:{$in:["task","follow_up"]},status:"open",dueAt:{$gte:start,$lt:end}}),
      ClientActivity.countDocuments({createdBy:ownerId,type:{$in:["task","follow_up"]},status:"open",dueAt:{$gte:end}}),
      ClientActivity.countDocuments({createdBy:ownerId,type:{$in:["task","follow_up"]},status:"open",dueAt:null}),
      ClientActivity.countDocuments({createdBy:ownerId,type:{$in:["task","follow_up"]},status:"completed"})
    ]);
    const linkedClientIds=[...new Set(records.map(item=>String(item.clientId)))];
    const linkedClients=await Client.find({createdBy:owner(req),_id:{$in:linkedClientIds}})
      .select("companyName name phone email accountStatus").lean();
    const linkedClientMap=new Map(linkedClients.map(client=>[String(client._id),client]));
    const activities=records.filter(item=>linkedClientMap.has(String(item.clientId))).map(item=>({
      ...item,
      clientId:String(item.clientId),
      client:linkedClientMap.get(String(item.clientId))
    }));
    return res.json({
      activities,
      pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))},
      summary:{open:openCount,overdue:overdueCount,dueToday:todayCount,upcoming:upcomingCount,noDate:noDateCount,completed:completedCount}
    });
  }catch(error){
    console.error("Client follow-up list error:",error);
    return res.status(500).json({message:"Unable to load customer follow-ups."});
  }
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
    const configuredFields=await loadConfiguredFormFields(owner(req),"clients.form");
    const prepared=await prepareConfiguredFormValues({
      ownerId:owner(req),
      formKey:"clients.form",
      fields:configuredFields,
      values:body,
      customFields:cleanCustomFields(body.customFields),
      isNewRecord:true
    });
    Object.assign(body,prepared.values);
    body.customFields=prepared.customFields;
    body.createdBy=owner(req);
    if(body.gstNumber)body.gstNumber=String(body.gstNumber).trim().toUpperCase();
    const client=new Client(body);
    await applyWorkflows({resource:"clients",event:"record_created",doc:client,createdBy:owner(req)});
    if(hasConfiguredCustomCalculations(configuredFields)){
      client.customFields=calculateConfiguredCustomFields(
        configuredFields,
        client.toObject({depopulate:true}),
        cleanCustomFields(client.customFields)
      );
    }
    const validated=validateConfiguredFormValues({
      fields:configuredFields,
      values:client.toObject({depopulate:true}),
      customFields:cleanCustomFields(client.customFields),
      validateAllValues:true
    });
    configuredFields.filter(field=>!field.custom).forEach(field=>{
      if(Object.prototype.hasOwnProperty.call(validated.values,field.key)){
        client.set(field.key,validated.values[field.key]);
      }
    });
    client.customFields=validated.customFields;
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
    const originalValues=client.toObject({depopulate:true});
    const originalCustomFields=cleanCustomFields(client.customFields);
    const allowed=["name","email","phone","address","state","city","pinCode","stateCode","gstNumber","companyName","businessType","paymentTerms","loyaltyPoints","discountRate","accountStatus","notes","customFields"];
    for(const key of allowed){
      if(req.body?.[key]===undefined)continue;
      if(key==="customFields"){
        client.customFields={
          ...cleanCustomFields(client.customFields),
          ...cleanCustomFields(req.body[key])
        };
      }else{
        client[key]=req.body[key];
      }
    }
    const configuredFields=await loadConfiguredFormFields(owner(req),"clients.form");
    const prepared=await prepareConfiguredFormValues({
      ownerId:owner(req),
      formKey:"clients.form",
      fields:configuredFields,
      values:client.toObject({depopulate:true}),
      customFields:cleanCustomFields(client.customFields),
      existingValues:originalValues,
      existingCustomFields:originalCustomFields,
      onlyChangedLookups:true
    });
    configuredFields.filter(field=>!field.custom).forEach(field=>{
      const nextValue=prepared.values[field.key];
      const currentValue=client.get(field.key);
      if(Object.prototype.hasOwnProperty.call(prepared.values,field.key)
        &&JSON.stringify(nextValue??null)!==JSON.stringify(currentValue??null)){
        client.set(field.key,nextValue);
      }
    });
    client.customFields=prepared.customFields;
    if(client.gstNumber)client.gstNumber=String(client.gstNumber).trim().toUpperCase();
    await applyWorkflows({resource:"clients",event:"record_updated",doc:client,createdBy:owner(req)});
    if(hasConfiguredCustomCalculations(configuredFields)){
      client.customFields=calculateConfiguredCustomFields(
        configuredFields,
        client.toObject({depopulate:true}),
        cleanCustomFields(client.customFields)
      );
    }
    const validated=validateConfiguredFormValues({
      fields:configuredFields,
      values:client.toObject({depopulate:true}),
      customFields:cleanCustomFields(client.customFields),
      existingValues:originalValues,
      existingCustomFields:originalCustomFields
    });
    configuredFields.filter(field=>!field.custom).forEach(field=>{
      if(Object.prototype.hasOwnProperty.call(validated.values,field.key)){
        client.set(field.key,validated.values[field.key]);
      }
    });
    client.customFields=validated.customFields;
    if(hadClientIdentity||req.body?.name!==undefined||req.body?.companyName!==undefined){
      assertClientIdentity(client);
    }
    await client.save();

    const changedStandardFields=allowed.filter(key=>{
      if(key==="customFields"||req.body?.[key]===undefined)return false;
      return JSON.stringify(originalValues[key]??null)!==JSON.stringify(client.get(key)??null);
    });
    const nextCustomFields=cleanCustomFields(client.customFields);
    const customKeys=[...new Set([...Object.keys(originalCustomFields),...Object.keys(nextCustomFields)])]
      .filter(key=>JSON.stringify(originalCustomFields[key]??null)!==JSON.stringify(nextCustomFields[key]??null));
    const customLabels=customKeys.map(key=>configuredFields.find(field=>field.custom&&field.key===key)?.label||"Additional information");
    const fieldLabels={
      name:"Customer name",companyName:"Company name",email:"Email",phone:"Phone",
      address:"Address",city:"City",state:"State",pinCode:"PIN code",
      gstNumber:"GST number",businessType:"Business type",paymentTerms:"Payment terms",
      discountRate:"Discount rate",accountStatus:"Account status",notes:"Notes"
    };
    const changedLabels=[...changedStandardFields.map(key=>fieldLabels[key]||"Customer details"),...customLabels];
    if(changedLabels.length){
      try{
        await ClientActivity.create({
          clientId:client._id,
          createdBy:owner(req),
          type:"profile_update",
          subject:"Customer details updated",
          description:"Updated: "+[...new Set(changedLabels)].join(", "),
          occurredAt:new Date(),
          status:"completed"
        });
      }catch(activityError){
        console.error("Unable to record customer profile update:",activityError.message);
      }
    }
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

function parseStatementDate(value,endOfDay=false){
  const raw=String(value||"").trim();
  if(!raw)return null;
  const dateOnly=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let normalized=raw;
  if(dateOnly){
    const year=Number(dateOnly[1]),month=Number(dateOnly[2]),day=Number(dateOnly[3]);
    const calendarDate=new Date(Date.UTC(year,month-1,day));
    if(calendarDate.getUTCFullYear()!==year||calendarDate.getUTCMonth()+1!==month||calendarDate.getUTCDate()!==day)return null;
    normalized=raw+"T"+(endOfDay?"23:59:59.999":"00:00:00.000")+"+05:30";
  }
  const parsed=new Date(normalized);
  return Number.isNaN(parsed.getTime())?null:parsed;
}

router.get("/:id/statement",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid customer ID."});
    const client=await Client.findOne({_id:req.params.id,createdBy:owner(req)}).lean();
    if(!client)return res.status(404).json({message:"Customer not found."});

    const requestedFrom=req.query.from?parseStatementDate(req.query.from,false):null;
    const requestedTo=req.query.to?parseStatementDate(req.query.to,true):null;
    if((req.query.from&&!requestedFrom)||(req.query.to&&!requestedTo)){
      return res.status(400).json({message:"Enter valid statement dates."});
    }
    const from=requestedFrom||client.createdAt||new Date(0);
    const to=requestedTo||new Date();
    if(Number.isNaN(new Date(from).getTime())||Number.isNaN(new Date(to).getTime())){
      return res.status(400).json({message:"Customer account dates are invalid. Review the customer record."});
    }
    if(new Date(from).getTime()>new Date(to).getTime()){
      return res.status(400).json({message:"Statement start date must be on or before the end date."});
    }

    const orders=await Order.find({
      createdBy:owner(req),
      $or:[
        {clientId:client._id},
        {"financialHistory.previous.clientId":client._id},
        {"financialHistory.next.clientId":client._id}
      ]
    })
      .select("orderNumber orderDate createdAt status clientId roundOffFinalRevenue totalAmount finalRevenue payments paymentHistory financialHistory")
      .sort({orderDate:1,createdAt:1})
      .lean();
    const orderIds=orders.map(order=>order._id);
    const creditNotes=await CreditNote.find({
      createdBy:owner(req),
      $or:[
        {clientId:client._id},
        {originalOrderId:{$in:orderIds}}
      ]
    }).select("creditNoteNumber clientId originalOrderId settlement settlementHistory creditNoteDate createdAt updatedAt status cancelledAt")
      .sort({creditNoteDate:1,createdAt:1})
      .lean();

    const statement=buildCustomerStatement({
      client,
      orders,
      creditNotes,
      fromDate:from,
      toDate:to
    });

    return res.json({
      customer:{
        _id:client._id,
        name:client.name||"",
        companyName:client.companyName||"",
        phone:client.phone||"",
        email:client.email||""
      },
      statement
    });
  }catch(error){
    console.error("Customer statement error:",error);
    return res.status(error instanceof RangeError?400:500).json({
      message:error.message||"Unable to prepare customer statement."
    });
  }
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


router.get("/:id/activities",auth,async(req,res)=>{
 try{
  if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid client ID."});
  const client=await Client.findOne({_id:req.params.id,createdBy:owner(req)}).select("_id name companyName createdAt creditBalanceHistory").lean();
  if(!client)return res.status(404).json({message:"Client not found."});
  const rawLimit=Number(req.query.limit||150);
  const limit=Number.isFinite(rawLimit)?Math.min(500,Math.max(1,Math.floor(rawLimit))):150;
  const sourceLimit=1000;
  const [manualActivities,orders,expenses,calendarEvents]=await Promise.all([
   ClientActivity.find({clientId:client._id,createdBy:owner(req)}).sort({occurredAt:-1}).limit(sourceLimit).lean(),
   Order.find({createdBy:owner(req),$or:[
    {clientId:client._id},
    {"financialHistory.previous.clientId":client._id},
    {"financialHistory.next.clientId":client._id}
   ]}).select("orderNumber orderDate createdAt updatedAt clientId statusHistory payments paymentHistory financialHistory totalAmount roundOffFinalRevenue")
     .sort({createdAt:-1}).limit(sourceLimit).lean(),
   Expense.find({clientId:client._id,createdBy:owner(req)}).select("title description category amount date createdAt orderId")
     .sort({date:-1,createdAt:-1}).limit(sourceLimit).lean(),
   CalendarEvent.find({clientId:client._id,createdBy:owner(req)}).select("title start end createdAt")
     .sort({start:-1}).limit(sourceLimit).lean()
  ]);
  const orderIds=orders.map(order=>order._id);
  const creditNotes=await CreditNote.find({createdBy:owner(req),$or:[
   {clientId:client._id},{originalOrderId:{$in:orderIds}}
  ]}).select("creditNoteNumber originalInvoiceNumber originalOrderId clientId reason status totals settlementHistory creditNoteDate createdAt")
    .sort({creditNoteDate:-1,createdAt:-1}).limit(sourceLimit).lean();
  return res.json(buildClientActivityTimeline({
   client,manualActivities,orders,creditNotes,expenses,calendarEvents,limit,
   sourceTruncated:manualActivities.length===sourceLimit||orders.length===sourceLimit||expenses.length===sourceLimit||calendarEvents.length===sourceLimit||creditNotes.length===sourceLimit
  }));
 }catch(error){
  console.error("Client activity timeline error:",error);
  return res.status(500).json({message:"Unable to load this customer's activity."});
 }
});

router.post("/:id/activities",auth,async(req,res)=>{
 try{
  if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid client ID."});
  const client=await Client.findOne({_id:req.params.id,createdBy:owner(req)}).select("_id");
  if(!client)return res.status(404).json({message:"Client not found."});
  const types=["note","call","email","meeting","follow_up","task","whatsapp","other"];
  const type=String(req.body?.type||"note");
  const subject=String(req.body?.subject||"").trim();
  const description=String(req.body?.description||"").trim();
  if(!types.includes(type))return res.status(400).json({message:"Choose a valid activity type."});
  if(!subject)return res.status(400).json({message:"Add a short title for this activity."});
  if(subject.length>160||description.length>4000)return res.status(400).json({message:"The activity details are too long."});
  const occurredAt=req.body?.occurredAt?new Date(req.body.occurredAt):new Date();
  const dueAt=req.body?.dueAt?new Date(req.body.dueAt):null;
  if(Number.isNaN(occurredAt.getTime())||(req.body?.dueAt&&Number.isNaN(dueAt?.getTime()))){
   return res.status(400).json({message:"Enter a valid activity date."});
  }
  const isFollowUp=["task","follow_up"].includes(type);
  const activity=await ClientActivity.create({
   clientId:client._id,createdBy:owner(req),type,subject,description,occurredAt,
   dueAt:isFollowUp?dueAt:null,status:isFollowUp?"open":"completed"
  });
  return res.status(201).json(activity);
 }catch(error){return res.status(400).json({message:error.message||"Unable to save this activity."});}
});

router.patch("/:id/activities/:activityId",auth,async(req,res)=>{
 try{
  if(!mongoose.isValidObjectId(req.params.id)||!mongoose.isValidObjectId(req.params.activityId))return res.status(400).json({message:"Invalid activity reference."});
  const status=String(req.body?.status||"");
  if(!["open","completed","cancelled"].includes(status))return res.status(400).json({message:"Choose a valid follow-up status."});
  const activity=await ClientActivity.findOne({_id:req.params.activityId,clientId:req.params.id,createdBy:owner(req)});
  if(!activity)return res.status(404).json({message:"Activity not found."});
  if(!["task","follow_up"].includes(activity.type))return res.status(400).json({message:"Only tasks and follow-ups have a completion status."});
  activity.status=status;
  activity.completedAt=status==="completed"?new Date():null;
  await activity.save();
  return res.json(activity);
 }catch(error){return res.status(400).json({message:error.message||"Unable to update this follow-up."});}
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
    const linkedActivity=await ClientActivity.exists({clientId:req.params.id,createdBy:owner(req)});
    if(linkedActivity)return res.status(409).json({message:"Customer cannot be deleted because activity history is linked to it. Keep the customer record and mark it Inactive instead."});
    const client=await Client.findOneAndDelete({_id:req.params.id,createdBy:owner(req)});
    if(!client)return res.status(404).json({message:"Client not found"});
    res.json({message:"Client deleted successfully"});
  }catch(error){res.status(500).json({message:error.message});}
});

module.exports=router;
