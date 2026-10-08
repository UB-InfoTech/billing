const express=require("express");
const mongoose=require("mongoose");
const DashboardConfiguration=require("../models/DashboardConfiguration");
const auth=require("../middleware/auth");

const router=express.Router();
const owner=req=>new mongoose.Types.ObjectId(req.user.id);

const DEFAULT_WIDGETS=[
  {key:"invoices",title:"Invoices",visible:true,order:0},
  {key:"clients",title:"Clients",visible:true,order:1},
  {key:"products",title:"Products",visible:true,order:2},
  {key:"revenue",title:"Revenue",visible:true,order:3},
  {key:"outstanding",title:"Outstanding",visible:true,order:4},
  {key:"expenses",title:"Expenses",visible:true,order:5},
  {key:"paid",title:"Paid",visible:true,order:6},
  {key:"creditNotes",title:"Credit Notes",visible:true,order:7},
  {key:"netAfterExpenses",title:"Net after Expenses",visible:true,order:8},
  {key:"quickActions",title:"Quick actions",visible:true,order:9}
];

const normalize=input=>{
  const allowed=new Map(DEFAULT_WIDGETS.map(item=>[item.key,item]));
  const seen=new Set();
  const result=[];
  (Array.isArray(input)?input:[]).forEach(item=>{
    const key=String(item?.key||"");
    if(!allowed.has(key)||seen.has(key))return;
    const fallback=allowed.get(key);
    seen.add(key);
    result.push({
      key,
      title:String(item?.title||fallback.title).trim().slice(0,80)||fallback.title,
      visible:item?.visible!==false,
      order:result.length
    });
  });
  DEFAULT_WIDGETS.forEach(item=>{
    if(seen.has(item.key))return;
    result.push({...item,order:result.length});
  });
  if(result.every(item=>item.visible===false))result[0].visible=true;
  return result.map((item,index)=>({...item,order:index}));
};

router.get("/",auth,async(req,res)=>{
  try{
    const config=await DashboardConfiguration.findOne({createdBy:owner(req)}).lean();
    res.json(config||{widgets:DEFAULT_WIDGETS});
  }catch(error){res.status(500).json({message:"Unable to load dashboard settings."});}
});

router.put("/",auth,async(req,res)=>{
  try{
    const widgets=normalize(req.body?.widgets);
    const config=await DashboardConfiguration.findOneAndUpdate(
      {createdBy:owner(req)},
      {$set:{widgets}},
      {new:true,upsert:true,setDefaultsOnInsert:true,runValidators:true}
    ).lean();
    res.json(config);
  }catch(error){res.status(400).json({message:error.message||"Unable to save dashboard settings."});}
});

router.post("/reset",auth,async(req,res)=>{
  try{
    const config=await DashboardConfiguration.findOneAndUpdate(
      {createdBy:owner(req)},
      {$set:{widgets:DEFAULT_WIDGETS}},
      {new:true,upsert:true,setDefaultsOnInsert:true,runValidators:true}
    ).lean();
    res.json(config);
  }catch(error){res.status(500).json({message:"Unable to reset dashboard settings."});}
});

module.exports=router;
