const express=require("express");
const mongoose=require("mongoose");
const TableConfiguration=require("../models/TableConfiguration");
const auth=require("../middleware/auth");

const router=express.Router();

const owner=req=>String(req.user.id);
const cleanString=(value,max)=>String(value??"").trim().slice(0,max);

const sanitizeColumns=(columns)=>{
  if(!Array.isArray(columns))throw new Error("columns must be an array.");
  const seen=new Set();
  return columns.slice(0,200).map((raw,index)=>{
    const key=cleanString(raw?.key,100);
    const label=cleanString(raw?.label||key,120);
    if(!key||!label)throw new Error("Every table column requires a key and label.");
    if(seen.has(key))throw new Error("Duplicate table column key: "+key);
    seen.add(key);

    const kind=raw?.kind==="merged"?"merged":"field";
    const sourceKeys=Array.isArray(raw?.sourceKeys)
      ? [...new Set(raw.sourceKeys.map(x=>cleanString(x,100)).filter(Boolean))].slice(0,30)
      : [];

    if(kind==="merged"&&sourceKeys.length<2){
      throw new Error("Merged columns must contain at least two source fields.");
    }

    return{
      key,
      label,
      visible:raw?.visible!==false,
      locked:Boolean(raw?.locked),
      kind,
      sourceKeys,
      separator:cleanString(raw?.separator??" ",40),
      order:Number.isFinite(Number(raw?.order))?Math.max(0,Number(raw.order)):index
    };
  });
};

router.get("/:tableKey",auth,async(req,res)=>{
  try{
    const tableKey=cleanString(req.params.tableKey,120);
    if(!tableKey)return res.status(400).json({message:"Table key is required."});
    const config=await TableConfiguration.findOne({createdBy:owner(req),tableKey}).lean();
    return res.json(config||{tableKey,columns:[]});
  }catch(error){
    return res.status(500).json({message:error.message});
  }
});

router.put("/:tableKey",auth,async(req,res)=>{
  try{
    const tableKey=cleanString(req.params.tableKey,120);
    if(!tableKey)return res.status(400).json({message:"Table key is required."});
    const columns=sanitizeColumns(req.body?.columns);

    const config=await TableConfiguration.findOneAndUpdate(
      {createdBy:new mongoose.Types.ObjectId(owner(req)),tableKey},
      {$set:{columns}},
      {new:true,upsert:true,runValidators:true,setDefaultsOnInsert:true}
    ).lean();

    return res.json(config);
  }catch(error){
    return res.status(400).json({message:error.message});
  }
});

router.delete("/:tableKey",auth,async(req,res)=>{
  try{
    const tableKey=cleanString(req.params.tableKey,120);
    await TableConfiguration.deleteOne({createdBy:owner(req),tableKey});
    return res.json({message:"Table configuration reset successfully."});
  }catch(error){
    return res.status(500).json({message:error.message});
  }
});

module.exports=router;
