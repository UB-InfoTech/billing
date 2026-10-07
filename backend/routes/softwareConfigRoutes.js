const express=require("express");
const mongoose=require("mongoose");
const auth=require("../middleware/auth");
const SoftwareConfiguration=require("../models/SoftwareConfiguration");

const router=express.Router();
const owner=req=>new mongoose.Types.ObjectId(req.user.id);

const DEFAULT_NAVIGATION=[
  {key:"dashboard",label:"Dashboard",visible:true,order:0},
  {key:"analytics",label:"Reports",visible:true,order:1},
  {key:"orders",label:"Bills",visible:true,order:2},
  {key:"clients",label:"Clients",visible:true,order:3},
  {key:"products",label:"Products",visible:true,order:4},
  {key:"expense",label:"Expenses",visible:true,order:5},
  {key:"calendar",label:"Calendar",visible:true,order:6},
  {key:"bulk-payment",label:"Payments",visible:true,order:7},
  {key:"credit-notes",label:"Credit Notes",visible:true,order:8},
  {key:"settings",label:"Settings",visible:true,order:9}
];

const cleanNavigation=input=>{
  const allowed=new Map(DEFAULT_NAVIGATION.map(item=>[item.key,item]));
  const incoming=Array.isArray(input)?input:[];
  const seen=new Set();

  const normalized=incoming
    .filter(item=>allowed.has(String(item?.key||""))&&!seen.has(String(item?.key||"")))
    .map((item,index)=>{
      const key=String(item.key);
      seen.add(key);
      const fallback=allowed.get(key);
      return {
        key,
        label:String(item.label||fallback.label).trim().slice(0,100),
        visible:item.visible!==false,
        order:index
      };
    });

  DEFAULT_NAVIGATION.forEach(item=>{
    if(seen.has(item.key))return;
    normalized.push({...item,order:normalized.length});
  });

  return normalized.map((item,index)=>({...item,order:index}));
};

router.get("/",auth,async(req,res)=>{
  try{
    const config=await SoftwareConfiguration.findOne({createdBy:owner(req)}).lean();
    return res.json(config||{navigation:DEFAULT_NAVIGATION,appearance:{compactMode:false,showPageHelp:true}});
  }catch(error){
    return res.status(500).json({message:"Unable to load software settings."});
  }
});

router.put("/",auth,async(req,res)=>{
  try{
    const navigation=cleanNavigation(req.body?.navigation);
    const appearance={
      compactMode:Boolean(req.body?.appearance?.compactMode),
      showPageHelp:req.body?.appearance?.showPageHelp!==false
    };
    const config=await SoftwareConfiguration.findOneAndUpdate(
      {createdBy:owner(req)},
      {$set:{navigation,appearance}},
      {new:true,upsert:true,setDefaultsOnInsert:true,runValidators:true}
    ).lean();
    return res.json(config);
  }catch(error){
    return res.status(400).json({message:error.message||"Unable to save software settings."});
  }
});

router.post("/reset",auth,async(req,res)=>{
  try{
    const config=await SoftwareConfiguration.findOneAndUpdate(
      {createdBy:owner(req)},
      {$set:{navigation:DEFAULT_NAVIGATION,appearance:{compactMode:false,showPageHelp:true}}},
      {new:true,upsert:true,setDefaultsOnInsert:true,runValidators:true}
    ).lean();
    return res.json(config);
  }catch(error){
    return res.status(500).json({message:"Unable to reset software settings."});
  }
});

module.exports=router;
