const express=require("express");
const mongoose=require("mongoose");
const auth=require("../middleware/auth");
const Deal=require("../models/Deal");
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
  if(!title)return res.status(400).json({message:"Give this opportunity a name.");
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
