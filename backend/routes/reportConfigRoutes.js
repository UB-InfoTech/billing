const express=require("express");
const mongoose=require("mongoose");
const auth=require("../middleware/auth");
const ReportConfiguration=require("../models/ReportConfiguration");

const router=express.Router();
const owner=req=>new mongoose.Types.ObjectId(req.user.id);

const DEFAULT_WIDGETS=[
  {key:"summary",title:"Sales snapshot",visible:true,order:0},
  {key:"salesByPeriod",title:"Sales by period",visible:true,order:1},
  {key:"orderCount",title:"Order count",visible:true,order:2},
  {key:"statusBreakdown",title:"Order status",visible:true,order:3},
  {key:"dailyTrend",title:"Daily sales trend",visible:true,order:4},
  {key:"indiaMap",title:"Sales by state",visible:true,order:5},
  {key:"ordersTable",title:"Order details",visible:true,order:6}
];

const cleanWidgets=input=>{
  const allowed=new Map(DEFAULT_WIDGETS.map(item=>[item.key,item]));
  const incoming=Array.isArray(input)?input:[];
  const seen=new Set();
  const normalized=[];

  incoming.forEach((item,index)=>{
    const key=String(item?.key||"");
    if(!allowed.has(key)||seen.has(key))return;
    const fallback=allowed.get(key);
    seen.add(key);
    normalized.push({
      key,
      title:String(item?.title||fallback.title).trim().slice(0,80)||fallback.title,
      visible:item?.visible!==false,
      order:index
    });
  });

  DEFAULT_WIDGETS.forEach(item=>{
    if(seen.has(item.key))return;
    normalized.push({...item,order:normalized.length});
  });

  if(normalized.every(item=>item.visible===false))normalized[0].visible=true;
  return normalized.map((item,index)=>({...item,order:index}));
};

const defaultResponse=()=>({widgets:DEFAULT_WIDGETS.map(item=>({...item}))});

router.get("/",auth,async(req,res)=>{
  try{
    const config=await ReportConfiguration.findOne({createdBy:owner(req)}).lean();
    res.json(config||defaultResponse());
  }catch(error){
    res.status(500).json({message:"Unable to load report settings."});
  }
});

router.put("/",auth,async(req,res)=>{
  try{
    const widgets=cleanWidgets(req.body?.widgets);
    const config=await ReportConfiguration.findOneAndUpdate(
      {createdBy:owner(req)},
      {$set:{widgets}},
      {new:true,upsert:true,setDefaultsOnInsert:true,runValidators:true}
    ).lean();
    res.json(config);
  }catch(error){
    res.status(400).json({message:error.message||"Unable to save report settings."});
  }
});

router.post("/reset",auth,async(req,res)=>{
  try{
    const config=await ReportConfiguration.findOneAndUpdate(
      {createdBy:owner(req)},
      {$set:{widgets:DEFAULT_WIDGETS}},
      {new:true,upsert:true,setDefaultsOnInsert:true,runValidators:true}
    ).lean();
    res.json(config);
  }catch(error){
    res.status(500).json({message:"Unable to reset report settings."});
  }
});

module.exports=router;
