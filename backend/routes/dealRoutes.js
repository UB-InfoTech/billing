const express=require("express");
const mongoose=require("mongoose");
const auth=require("../middleware/auth");
const Deal=require("../models/Deal");
const DealActivity=require("../models/DealActivity");
const ClientActivity=require("../models/ClientActivity");
const SalesPipeline=require("../models/SalesPipeline");
const Client=require("../models/Client");
const {DEFAULT_DEAL_STAGES,normalizeOpenStages}=require("../utils/dealPipeline");
const {escapeRegex}=require("../utils/escapeRegex");

const router=express.Router();
const owner=req=>req.user.id;
const CLIENT_FIELDS="name companyName phone email accountStatus";

function parseDate(value,label){
 if(value===null||value===undefined||value==="")return null;
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))throw new Error("Enter a valid "+label+".");
 return date;
}

function cleanText(value,max,label){
 const text=String(value??"").trim();
 if(text.length>max)throw new Error(label+" is too long.");
 return text;
}

async function getPipeline(ownerId){
 let pipeline=await SalesPipeline.findOne({createdBy:ownerId});
 if(pipeline)return pipeline;
 try{
  pipeline=await SalesPipeline.create({createdBy:ownerId,stages:DEFAULT_DEAL_STAGES});
  return pipeline;
 }catch(error){
  if(error.code===11000){
   pipeline=await SalesPipeline.findOne({createdBy:ownerId});
   if(pipeline)return pipeline;
  }
  throw error;
 }
}

async function ownedClient(clientId,ownerId){
 if(!clientId)return null;
 if(!mongoose.isValidObjectId(clientId))throw new Error("Choose a valid customer.");
 const client=await Client.findOne({_id:clientId,createdBy:ownerId})
  .select("_id name companyName phone email accountStatus");
 if(!client)throw new Error("That customer is not available in your business.");
 if(client.accountStatus==="Inactive")throw new Error("Choose an active customer.");
 return client;
}

function assignClientSnapshot(deal,client,body){
 if(client){
  deal.clientId=client._id;
  deal.contactName=client.name||client.companyName||"";
  deal.contactPhone=client.phone||"";
  deal.contactEmail=client.email||"";
 }else{
  deal.clientId=null;
  if(Object.prototype.hasOwnProperty.call(body,"contactName"))deal.contactName=cleanText(body.contactName,120,"Contact name");
  if(Object.prototype.hasOwnProperty.call(body,"contactPhone"))deal.contactPhone=cleanText(body.contactPhone,30,"Phone number");
  if(Object.prototype.hasOwnProperty.call(body,"contactEmail"))deal.contactEmail=cleanText(body.contactEmail,160,"Email address").toLowerCase();
 }
}

async function populatedDeal(id,ownerId){
 return Deal.findOne({_id:id,createdBy:ownerId}).populate("clientId",CLIENT_FIELDS).lean();
}

router.get("/pipeline",auth,async(req,res)=>{
 try{
  const pipeline=await getPipeline(owner(req));
  return res.json({name:pipeline.name,stages:pipeline.stages.slice().sort((a,b)=>a.order-b.order)});
 }catch(error){
  console.error("Sales pipeline load error:",error);
  return res.status(500).json({message:"The sales pipeline could not be loaded."});
 }
});

router.put("/pipeline",auth,async(req,res)=>{
 try{
  const stages=normalizeOpenStages(req.body?.stages);
  const keys=stages.filter(stage=>stage.outcome==="open").map(stage=>stage.key);
  const pipeline=await getPipeline(owner(req));
  const removed=pipeline.stages.filter(stage=>stage.outcome==="open"&&!keys.includes(stage.key));
  for(const stage of removed){
   const inUse=await Deal.exists({createdBy:owner(req),stageKey:stage.key,status:"open"});
   if(inUse)return res.status(409).json({message:"Move all opportunities out of '"+stage.label+"' before removing that stage."});
  }
  pipeline.stages=stages;
  await pipeline.save();
  await Promise.all(stages.filter(stage=>stage.outcome==="open").map(stage=>
   Deal.updateMany({createdBy:owner(req),stageKey:stage.key,status:"open"},{$set:{probability:stage.probability}})
  ));
  return res.json({name:pipeline.name,stages:pipeline.stages.slice().sort((a,b)=>a.order-b.order)});
 }catch(error){
  return res.status(400).json({message:error.message||"Sales stages could not be saved."});
 }
});

router.get("/summary",auth,async(req,res)=>{
 try{
  const ownerId=new mongoose.Types.ObjectId(owner(req));
  const now=new Date();
  const [totals,overdueCount,noNextActionCount,stageTotals]=await Promise.all([
   Deal.aggregate([
    {$match:{createdBy:ownerId,status:"open"}},
    {$group:{
     _id:null,
     openCount:{$sum:1},
     pipelineValue:{$sum:"$value"},
     weightedValue:{$sum:{$multiply:["$value",{$divide:["$probability",100]}]}}
    }}
   ]),
   Deal.countDocuments({createdBy:ownerId,status:"open",nextActionAt:{$lt:now}}),
   Deal.countDocuments({createdBy:ownerId,status:"open",$or:[{nextAction:""},{nextAction:null},{nextActionAt:null}]}),
   Deal.aggregate([
    {$match:{createdBy:ownerId}},
    {$group:{_id:{stageKey:"$stageKey",status:"$status"},count:{$sum:1},value:{$sum:"$value"}}}
   ])
  ]);
  const row=totals[0]||{};
  return res.json({
   openCount:Number(row.openCount||0),
   pipelineValue:Number(row.pipelineValue||0),
   weightedValue:Number(row.weightedValue||0),
   overdueCount,
   noNextActionCount,
   stages:stageTotals.map(item=>({stageKey:item._id.stageKey,status:item._id.status,count:item.count,value:item.value}))
  });
 }catch(error){
  console.error("Sales pipeline summary error:",error);
  return res.status(500).json({message:"The sales summary could not be loaded."});
 }
});


router.get("/performance",auth,async(req,res)=>{
 try{
  const ownerId=new mongoose.Types.ObjectId(owner(req));
  const now=new Date();
  let startAt,endAt;
  try{startAt=parseDate(req.query.startAt,"start date");endAt=parseDate(req.query.endAt,"end date");}
  catch(error){return res.status(400).json({message:error.message});}
  if(Boolean(startAt)!==Boolean(endAt))return res.status(400).json({message:"Choose both a start and end date."});
  if(!startAt){endAt=now;startAt=new Date(now);startAt.setDate(startAt.getDate()-90);}
  if(endAt<=startAt)return res.status(400).json({message:"The end date must be after the start date."});
  const range={$gte:startAt,$lt:endAt};
  const periodDuration=endAt.getTime()-startAt.getTime();
  const previousStartAt=new Date(startAt.getTime()-periodDuration);
  const previousRange={$gte:previousStartAt,$lt:startAt};
  const trendFormat=(endAt-startAt)>120*24*60*60*1000?"%Y-%m":"%G-W%V";
  const trendTimeframe=trendFormat==="%Y-%m"?"monthly":"weekly";

  const reminderStats=async Model=>{
   const result=await Model.aggregate([
    {$match:{createdBy:ownerId,type:{$in:["task","follow_up"]}}},
    {$facet:{
     due:[{$match:{dueAt:range,status:{$in:["open","completed"]}}},{$group:{_id:null,dueCount:{$sum:1},completedDueCount:{$sum:{$cond:[{$eq:["$status","completed"]},1,0]}},openDueCount:{$sum:{$cond:[{$eq:["$status","open"]},1,0]}}}}],
     overdue:[{$match:{status:"open",dueAt:{$ne:null,$lt:now}}},{$count:"count"}],
     completedDuring:[{$match:{status:"completed",completedAt:range}},{$count:"count"}]
    }}
   ]);
   const row=result[0]||{},due=row.due?.[0]||{};
   return {dueCount:Number(due.dueCount||0),completedDueCount:Number(due.completedDueCount||0),openDueCount:Number(due.openDueCount||0),overdueOpenCount:Number(row.overdue?.[0]?.count||0),completedDuringPeriod:Number(row.completedDuring?.[0]?.count||0)};
  };

  const [createdRows,closedRows,trendRows,pipelineRows,comparisonRows,sourceRows,customerReminders,dealReminders,pipelineDoc]=await Promise.all([
   Deal.aggregate([{$match:{createdBy:ownerId,createdAt:range}},{$group:{_id:null,count:{$sum:1},value:{$sum:"$value"}}}]),
   Deal.aggregate([{$match:{createdBy:ownerId,status:{$in:["won","lost"]},closedAt:range}},{$group:{
    _id:null,closedCount:{$sum:1},
    wonCount:{$sum:{$cond:[{$eq:["$status","won"]},1,0]}},
    lostCount:{$sum:{$cond:[{$eq:["$status","lost"]},1,0]}},
    wonValue:{$sum:{$cond:[{$eq:["$status","won"]},{$ifNull:["$value",0]},0]}},
    lostValue:{$sum:{$cond:[{$eq:["$status","lost"]},{$ifNull:["$value",0]},0]}},
    averageSalesCycleDays:{$avg:{$cond:[{$and:[{$eq:["$status","won"]},{$ne:["$createdAt",null]}]},{$divide:[{$subtract:["$closedAt","$createdAt"]},86400000]},null]}}
   }}]),
   Deal.aggregate([
    {$match:{createdBy:ownerId,status:{$in:["won","lost"]},closedAt:range}},
    {$group:{_id:{$dateToString:{format:trendFormat,date:"$closedAt"}},wonCount:{$sum:{$cond:[{$eq:["$status","won"]},1,0]}},lostCount:{$sum:{$cond:[{$eq:["$status","lost"]},1,0]}},wonValue:{$sum:{$cond:[{$eq:["$status","won"]},{$ifNull:["$value",0]},0]}}}},
    {$sort:{_id:1}}
   ]),
   Deal.aggregate([{$match:{createdBy:ownerId,status:"open"}},{$group:{_id:"$stageKey",count:{$sum:1},value:{$sum:"$value"},weightedValue:{$sum:{$multiply:["$value",{$divide:["$probability",100]}]}}}}]),
   Deal.aggregate([
    {$match:{createdBy:ownerId,$or:[
     {createdAt:range},{createdAt:previousRange},
     {status:{$in:["won","lost"]},closedAt:range},
     {status:{$in:["won","lost"]},closedAt:previousRange}
    ]}},
    {$facet:{
     createdCurrent:[{$match:{createdAt:range}},{$group:{_id:null,count:{$sum:1},value:{$sum:"$value"}}}],
     createdPrevious:[{$match:{createdAt:previousRange}},{$group:{_id:null,count:{$sum:1},value:{$sum:"$value"}}}],
     closedCurrent:[{$match:{status:{$in:["won","lost"]},closedAt:range}},{$group:{_id:null,count:{$sum:1},wonCount:{$sum:{$cond:[{$eq:["$status","won"]},1,0]}},lostCount:{$sum:{$cond:[{$eq:["$status","lost"]},1,0]}},wonValue:{$sum:{$cond:[{$eq:["$status","won"]},{$ifNull:["$value",0]},0]}}}}],
     closedPrevious:[{$match:{status:{$in:["won","lost"]},closedAt:previousRange}},{$group:{_id:null,count:{$sum:1},wonCount:{$sum:{$cond:[{$eq:["$status","won"]},1,0]}},lostCount:{$sum:{$cond:[{$eq:["$status","lost"]},1,0]}},wonValue:{$sum:{$cond:[{$eq:["$status","won"]},{$ifNull:["$value",0]},0]}}}}]
    }}
   ]),
   Deal.aggregate([
    {$match:{createdBy:ownerId,createdAt:range}},
    {$set:{sourceLabel:{$let:{vars:{cleaned:{$trim:{input:{$ifNull:["$source",""]}}}},in:{$cond:[{$eq:["$$cleaned",""]},"Not recorded","$$cleaned"]}}}}},
    {$group:{_id:"$sourceLabel",leadCount:{$sum:1},wonCount:{$sum:{$cond:[{$eq:["$status","won"]},1,0]}},lostCount:{$sum:{$cond:[{$eq:["$status","lost"]},1,0]}},wonValue:{$sum:{$cond:[{$eq:["$status","won"]},{$ifNull:["$value",0]},0]}}}},
    {$sort:{leadCount:-1,_id:1}}
   ]),
   reminderStats(ClientActivity),reminderStats(DealActivity),
   SalesPipeline.findOne({createdBy:ownerId}).lean()
  ]);

  const created=createdRows[0]||{},closed=closedRows[0]||{};
  const comparisonRow=comparisonRows[0]||{};
  const createdCurrent=comparisonRow.createdCurrent?.[0]||{},createdPrevious=comparisonRow.createdPrevious?.[0]||{};
  const closedCurrent=comparisonRow.closedCurrent?.[0]||{},closedPrevious=comparisonRow.closedPrevious?.[0]||{};
  const currentClosedCount=Number(closedCurrent.count||0),previousClosedCount=Number(closedPrevious.count||0);
  const currentWonCount=Number(closedCurrent.wonCount||0),previousWonCount=Number(closedPrevious.wonCount||0);
  const currentWinRate=currentClosedCount?Math.round(currentWonCount*10000/currentClosedCount)/100:null;
  const previousWinRate=previousClosedCount?Math.round(previousWonCount*10000/previousClosedCount)/100:null;
  const percentageChange=(current,previous)=>Number(previous)>0?Math.round(((Number(current)-Number(previous))/Number(previous))*1000)/10:null;
  const stageMap=new Map(pipelineRows.map(row=>[String(row._id),row]));
  const pipelineStages=(pipelineDoc?.stages||DEFAULT_DEAL_STAGES)
   .filter(stage=>stage.outcome==="open").slice().sort((a,b)=>a.order-b.order)
   .map(stage=>{const row=stageMap.get(stage.key)||{};return {key:stage.key,label:stage.label,probability:Number(stage.probability||0),count:Number(row.count||0),value:Number(row.value||0),weightedValue:Number(row.weightedValue||0)};});
  const pipelineSummary=pipelineStages.reduce((summary,stage)=>({count:summary.count+stage.count,value:summary.value+stage.value,weightedValue:summary.weightedValue+stage.weightedValue}),{count:0,value:0,weightedValue:0});
  const followUps={
   dueCount:customerReminders.dueCount+dealReminders.dueCount,
   completedDueCount:customerReminders.completedDueCount+dealReminders.completedDueCount,
   openDueCount:customerReminders.openDueCount+dealReminders.openDueCount,
   overdueOpenCount:customerReminders.overdueOpenCount+dealReminders.overdueOpenCount,
   completedDuringPeriod:customerReminders.completedDuringPeriod+dealReminders.completedDuringPeriod,
   completionRate:null,customers:customerReminders,opportunities:dealReminders
  };
  followUps.completionRate=followUps.dueCount?Math.round(followUps.completedDueCount*10000/followUps.dueCount)/100:null;
  const closedCount=Number(closed.closedCount||0),wonCount=Number(closed.wonCount||0),lostCount=Number(closed.lostCount||0);
  return res.json({
   range:{startAt:startAt.toISOString(),endAt:endAt.toISOString(),previousStartAt:previousStartAt.toISOString(),previousEndAt:startAt.toISOString(),trendTimeframe},
   comparison:{
    previous:{createdCount:Number(createdPrevious.count||0),createdValue:Number(createdPrevious.value||0),closedCount:previousClosedCount,wonCount:previousWonCount,lostCount:Number(closedPrevious.lostCount||0),wonValue:Number(closedPrevious.wonValue||0),winRate:previousWinRate},
    createdCountChange:percentageChange(createdCurrent.count,createdPrevious.count),
    wonCountChange:percentageChange(closedCurrent.wonCount,closedPrevious.wonCount),
    wonValueChange:percentageChange(closedCurrent.wonValue,closedPrevious.wonValue),
    winRateChangePoints:currentWinRate===null||previousWinRate===null?null:Math.round((currentWinRate-previousWinRate)*10)/10
   },
   summary:{
    createdCount:Number(created.count||0),createdValue:Number(created.value||0),closedCount,wonCount,lostCount,
    winRate:closedCount?Math.round(wonCount*10000/closedCount)/100:null,
    wonValue:Number(closed.wonValue||0),lostValue:Number(closed.lostValue||0),
    averageSalesCycleDays:closed.averageSalesCycleDays===null||closed.averageSalesCycleDays===undefined?null:Math.round(Number(closed.averageSalesCycleDays)*10)/10,
    pipelineCount:pipelineSummary.count,pipelineValue:pipelineSummary.value,weightedForecast:pipelineSummary.weightedValue
   },
   closedTrend:trendRows.map(row=>({period:row._id,wonCount:Number(row.wonCount||0),lostCount:Number(row.lostCount||0),wonValue:Number(row.wonValue||0)})),
   pipelineStages,
   sources:sourceRows.map(row=>{const won=Number(row.wonCount||0),lost=Number(row.lostCount||0),totalClosed=won+lost;return {source:row._id,leadCount:Number(row.leadCount||0),wonCount:won,lostCount:lost,winRate:totalClosed?Math.round(won*10000/totalClosed)/100:null,wonValue:Number(row.wonValue||0)};}),
   followUps
  });
 }catch(error){
  console.error("Sales performance load error:",error);
  return res.status(500).json({message:"The sales performance dashboard could not be loaded."});
 }
});

router.get("/",auth,async(req,res)=>{
 try{
  const query={createdBy:owner(req)};
  const status=String(req.query.status||"");
  if(["open","won","lost"].includes(status))query.status=status;
  if(req.query.stageKey)query.stageKey=String(req.query.stageKey).slice(0,50);
  const search=String(req.query.search||"").trim();
  if(search){
   const rx=new RegExp(escapeRegex(search.slice(0,100)),"i");
   query.$or=[{title:rx},{contactName:rx},{contactPhone:rx},{contactEmail:rx},{source:rx}];
  }
  const rawLimit=Number(req.query.limit||500);
  const limit=Number.isFinite(rawLimit)?Math.min(500,Math.max(1,Math.floor(rawLimit))):500;
  const deals=await Deal.find(query).populate("clientId",CLIENT_FIELDS)
   .sort({updatedAt:-1,_id:-1}).limit(limit).lean();
  const total=await Deal.countDocuments(query);
  return res.json({deals,total,hasMore:total>deals.length});
 }catch(error){
  console.error("Sales opportunities load error:",error);
  return res.status(500).json({message:"Sales opportunities could not be loaded."});
 }
});

router.post("/",auth,async(req,res)=>{
 try{
  const body=req.body||{};
  const title=cleanText(body.title,160,"Opportunity name");
  if(!title)return res.status(400).json({message:"Give this opportunity a name."});
  const value=body.value===undefined||body.value===""?0:Number(body.value);
  if(!Number.isFinite(value)||value<0||value>1000000000000)return res.status(400).json({message:"Enter a valid opportunity value."});
  const pipeline=await getPipeline(owner(req));
  const stageKey=String(body.stageKey||pipeline.stages.find(stage=>stage.outcome==="open")?.key||"");
  const stage=pipeline.stages.find(item=>item.key===stageKey);
  if(!stage||stage.outcome!=="open")return res.status(400).json({message:"Choose an open sales stage."});
  const client=await ownedClient(body.clientId,owner(req));
  const contactName=client?(client.name||client.companyName||""):cleanText(body.contactName,120,"Contact name");
  if(!client&&!contactName)return res.status(400).json({message:"Choose a customer or enter the prospect's name."});
  const expectedCloseDate=parseDate(body.expectedCloseDate,"expected closing date");
  const nextActionAt=parseDate(body.nextActionAt,"next action date");
  const deal=await Deal.create({
   title,clientId:client?._id||null,
   contactName,contactPhone:client?.phone||cleanText(body.contactPhone,30,"Phone number"),
   contactEmail:client?.email||cleanText(body.contactEmail,160,"Email address").toLowerCase(),
   value,currency:"INR",stageKey,status:"open",probability:stage.probability,
   expectedCloseDate,nextAction:cleanText(body.nextAction,160,"Next action"),
   nextActionAt,source:cleanText(body.source,80,"Lead source"),
   notes:cleanText(body.notes,5000,"Notes"),createdBy:owner(req),
   stageHistory:[{stageKey:stage.key,stageLabel:stage.label,previousStageKey:"",enteredAt:new Date(),changedBy:owner(req)}]
  });
  return res.status(201).json(await populatedDeal(deal._id,owner(req)));
 }catch(error){
  return res.status(400).json({message:error.message||"The opportunity could not be saved."});
 }
});

router.post("/:id/convert-customer",auth,async(req,res)=>{
 try{
  if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid opportunity ID."});
  const deal=await Deal.findOne({_id:req.params.id,createdBy:owner(req)});
  if(!deal)return res.status(404).json({message:"Opportunity not found."});
  if(deal.clientId)return res.json({deal:await populatedDeal(deal._id,owner(req)),customerId:String(deal.clientId),created:false});
  if(deal.status!=="won")return res.status(400).json({message:"Mark this opportunity as Won before creating a customer record."});
  const contactName=String(deal.contactName||"").trim();
  if(!contactName)return res.status(400).json({message:"Add a contact or business name before creating a customer record."});
  const duplicateConditions=[];
  if(deal.contactPhone)duplicateConditions.push({phone:deal.contactPhone});
  if(deal.contactEmail)duplicateConditions.push({email:deal.contactEmail.toLowerCase()});
  let client=duplicateConditions.length
   ?await Client.findOne({createdBy:owner(req),$or:duplicateConditions})
   :null;
  const created=!client;
  if(!client){
   client=await Client.create({
    name:contactName,companyName:contactName,
    phone:deal.contactPhone||"",email:deal.contactEmail||"",
    accountStatus:"Active",createdBy:owner(req)
   });
  }
  deal.clientId=client._id;
  deal.contactName=client.name||client.companyName||contactName;
  deal.contactPhone=client.phone||"";
  deal.contactEmail=client.email||"";
  await deal.save();
  return res.status(created?201:200).json({
   deal:await populatedDeal(deal._id,owner(req)),
   customerId:String(client._id),
   created
  });
 }catch(error){
  console.error("Opportunity conversion error:",error);
  return res.status(400).json({message:error.message||"The customer record could not be created."});
 }
});


async function syncDealNextAction(deal){
 const next=await DealActivity.findOne({
  dealId:deal._id,createdBy:deal.createdBy,type:{$in:["task","follow_up"]},status:"open"
 }).sort({dueAt:1,createdAt:1}).lean();
 if(next){
  deal.nextAction=next.subject;
  deal.nextActionAt=next.dueAt||null;
 }else{
  deal.nextAction="";
  deal.nextActionAt=null;
 }
 await deal.save();
}

router.get("/:id/activities",auth,async(req,res)=>{
 try{
  if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid opportunity ID."});
  const deal=await Deal.findOne({_id:req.params.id,createdBy:owner(req)}).select("_id");
  if(!deal)return res.status(404).json({message:"Opportunity not found."});
  const rawLimit=Number(req.query.limit||150);
  const limit=Number.isFinite(rawLimit)?Math.min(300,Math.max(1,Math.floor(rawLimit))):150;
  const activities=await DealActivity.find({dealId:deal._id,createdBy:owner(req)})
   .sort({occurredAt:-1,createdAt:-1}).limit(limit).lean();
  return res.json({activities,hasMore:activities.length===limit});
 }catch(error){
  console.error("Opportunity activity load error:",error);
  return res.status(500).json({message:"Unable to load this opportunity's activity."});
 }
});

router.post("/:id/activities",auth,async(req,res)=>{
 try{
  if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid opportunity ID."});
  const deal=await Deal.findOne({_id:req.params.id,createdBy:owner(req)});
  if(!deal)return res.status(404).json({message:"Opportunity not found."});
  const allowed=["note","call","email","meeting","whatsapp","quotation","follow_up","task","other"];
  const type=String(req.body?.type||"note");
  const subject=cleanText(req.body?.subject,160,"Activity title");
  const description=cleanText(req.body?.description,4000,"Activity details");
  if(!allowed.includes(type))return res.status(400).json({message:"Choose a valid activity type."});
  if(!subject)return res.status(400).json({message:"Add a short title for this activity."});
  const occurredAt=parseDate(req.body?.occurredAt,"activity date")||new Date();
  const isReminder=["task","follow_up"].includes(type);
  const dueAt=isReminder?parseDate(req.body?.dueAt,"reminder date"):null;
  const activity=await DealActivity.create({
   dealId:deal._id,createdBy:owner(req),type,subject,description,occurredAt,dueAt,
   status:isReminder?"open":"completed"
  });
  if(isReminder){
   deal.nextAction=subject;
   deal.nextActionAt=dueAt;
   await deal.save();
  }
  return res.status(201).json(activity);
 }catch(error){
  return res.status(400).json({message:error.message||"Unable to save this activity."});
 }
});

router.patch("/:id/activities/:activityId",auth,async(req,res)=>{
 try{
  if(!mongoose.isValidObjectId(req.params.id)||!mongoose.isValidObjectId(req.params.activityId)){
   return res.status(400).json({message:"Invalid activity reference."});
  }
  const [deal,activity]=await Promise.all([
   Deal.findOne({_id:req.params.id,createdBy:owner(req)}),
   DealActivity.findOne({_id:req.params.activityId,dealId:req.params.id,createdBy:owner(req)})
  ]);
  if(!deal||!activity)return res.status(404).json({message:"Opportunity activity not found."});
  if(activity.type==="note"){
   const subject=cleanText(req.body?.subject,160,"Note title");
   const description=cleanText(req.body?.description,4000,"Note details");
   if(!subject)return res.status(400).json({message:"Give this note a short title."});
   activity.subject=subject;
   activity.description=description;
   await activity.save();
   return res.json(activity);
  }
  if(!["task","follow_up"].includes(activity.type)){
   return res.status(400).json({message:"Only notes and reminders can be edited."});
  }
  if(Object.prototype.hasOwnProperty.call(req.body||{},"subject")){
   const subject=cleanText(req.body.subject,160,"Reminder title");
   if(!subject)return res.status(400).json({message:"Give this reminder a short title."});
   activity.subject=subject;
  }
  if(Object.prototype.hasOwnProperty.call(req.body||{},"description")){
   activity.description=cleanText(req.body.description,4000,"Reminder details");
  }
  if(Object.prototype.hasOwnProperty.call(req.body||{},"dueAt")){
   activity.dueAt=parseDate(req.body.dueAt,"reminder date");
  }
  if(Object.prototype.hasOwnProperty.call(req.body||{},"status")){
   const status=String(req.body.status||"");
   if(!["open","completed","cancelled"].includes(status)){
    return res.status(400).json({message:"Choose a valid reminder status."});
   }
   activity.status=status;
   activity.completedAt=status==="completed"?new Date():null;
  }
  await activity.save();
  await syncDealNextAction(deal);
  return res.json(activity);
 }catch(error){
  return res.status(400).json({message:error.message||"Unable to update this opportunity activity."});
 }
});

router.delete("/:id/activities/:activityId",auth,async(req,res)=>{
 try{
  if(!mongoose.isValidObjectId(req.params.id)||!mongoose.isValidObjectId(req.params.activityId)){
   return res.status(400).json({message:"Invalid activity reference."});
  }
  const activity=await DealActivity.findOneAndDelete({
   _id:req.params.activityId,dealId:req.params.id,createdBy:owner(req),type:"note"
  });
  if(!activity)return res.status(404).json({message:"Opportunity note not found."});
  return res.json({message:"Opportunity note deleted."});
 }catch(error){
  return res.status(400).json({message:error.message||"Unable to delete this opportunity note."});
 }
});

router.get("/:id",auth,async(req,res)=>{
 try{
  if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid opportunity ID."});
  const deal=await populatedDeal(req.params.id,owner(req));
  if(!deal)return res.status(404).json({message:"Opportunity not found."});
  return res.json(deal);
 }catch(error){return res.status(500).json({message:"The opportunity could not be loaded."});}
});

router.patch("/:id/stage",auth,async(req,res)=>{
 try{
  if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid opportunity ID."});
  const [deal,pipeline]=await Promise.all([
   Deal.findOne({_id:req.params.id,createdBy:owner(req)}),
   getPipeline(owner(req))
  ]);
  if(!deal)return res.status(404).json({message:"Opportunity not found."});
  const stage=pipeline.stages.find(item=>item.key===String(req.body?.stageKey||""));
  if(!stage)return res.status(400).json({message:"Choose a valid sales stage."});
  const lostReason=cleanText(req.body?.lostReason,160,"Lost reason");
  const lostNotes=cleanText(req.body?.lostNotes,2000,"Lost details");
  if(stage.outcome==="lost"&&!lostReason)return res.status(400).json({message:"Add a reason before marking this opportunity as lost."});
  const previousStageKey=deal.stageKey;
  if(previousStageKey===stage.key&&deal.status===stage.outcome){
   if(stage.outcome==="lost"){
    deal.lostReason=lostReason;
    deal.lostNotes=lostNotes;
    await deal.save();
   }
   return res.json(await populatedDeal(deal._id,owner(req)));
  }
  deal.stageKey=stage.key;
  deal.status=stage.outcome;
  deal.probability=stage.probability;
  deal.closedAt=stage.outcome==="open"?null:new Date();
  deal.lostReason=stage.outcome==="lost"?lostReason:"";
  deal.lostNotes=stage.outcome==="lost"?lostNotes:"";
  deal.stageHistory.push({
   stageKey:stage.key,stageLabel:stage.label,previousStageKey,
   enteredAt:new Date(),changedBy:owner(req)
  });
  await deal.save();
  return res.json(await populatedDeal(deal._id,owner(req)));
 }catch(error){
  return res.status(400).json({message:error.message||"The opportunity could not be moved."});
 }
});

router.patch("/:id",auth,async(req,res)=>{
 try{
  if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid opportunity ID."});
  const deal=await Deal.findOne({_id:req.params.id,createdBy:owner(req)});
  if(!deal)return res.status(404).json({message:"Opportunity not found."});
  const body=req.body||{};
  if(Object.prototype.hasOwnProperty.call(body,"title")){
   deal.title=cleanText(body.title,160,"Opportunity name");
   if(!deal.title)return res.status(400).json({message:"Give this opportunity a name."});
  }
  if(Object.prototype.hasOwnProperty.call(body,"value")){
   const value=Number(body.value);
   if(!Number.isFinite(value)||value<0||value>1000000000000)return res.status(400).json({message:"Enter a valid opportunity value."});
   deal.value=value;
  }
  if(Object.prototype.hasOwnProperty.call(body,"clientId")){
   const client=await ownedClient(body.clientId,owner(req));
   if(client)assignClientSnapshot(deal,client,body);
   else{
    deal.clientId=null;
    deal.contactName=cleanText(body.contactName,120,"Contact name");
    deal.contactPhone=cleanText(body.contactPhone,30,"Phone number");
    deal.contactEmail=cleanText(body.contactEmail,160,"Email address").toLowerCase();
   }
  }else{
   if(Object.prototype.hasOwnProperty.call(body,"contactName"))deal.contactName=cleanText(body.contactName,120,"Contact name");
   if(Object.prototype.hasOwnProperty.call(body,"contactPhone"))deal.contactPhone=cleanText(body.contactPhone,30,"Phone number");
   if(Object.prototype.hasOwnProperty.call(body,"contactEmail"))deal.contactEmail=cleanText(body.contactEmail,160,"Email address").toLowerCase();
  }
  if(!deal.clientId&&!deal.contactName)return res.status(400).json({message:"Choose a customer or enter the prospect's name."});
  if(Object.prototype.hasOwnProperty.call(body,"expectedCloseDate"))deal.expectedCloseDate=parseDate(body.expectedCloseDate,"expected closing date");
  if(Object.prototype.hasOwnProperty.call(body,"nextActionAt"))deal.nextActionAt=parseDate(body.nextActionAt,"next action date");
  if(Object.prototype.hasOwnProperty.call(body,"nextAction"))deal.nextAction=cleanText(body.nextAction,160,"Next action");
  if(Object.prototype.hasOwnProperty.call(body,"source"))deal.source=cleanText(body.source,80,"Lead source");
  if(Object.prototype.hasOwnProperty.call(body,"notes"))deal.notes=cleanText(body.notes,5000,"Notes");
  await deal.save();
  return res.json(await populatedDeal(deal._id,owner(req)));
 }catch(error){
  return res.status(400).json({message:error.message||"The opportunity could not be updated."});
 }
});

module.exports=router;
