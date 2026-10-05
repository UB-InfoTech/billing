const express=require("express");
const mongoose=require("mongoose");
const FormConfiguration=require("../models/FormConfiguration");
const auth=require("../middleware/auth");

const router=express.Router();

const FIELD_TYPES=["text","textarea","number","currency","date","datetime","select","boolean"];
const owner=req=>String(req.user.id);
const cleanString=(value,max)=>String(value??"").trim().slice(0,max);

const sanitizeFields=fields=>{
  if(!Array.isArray(fields))throw new Error("fields must be an array.");

  const seen=new Set();
  return fields.slice(0,300).map((raw,index)=>{
    const key=cleanString(raw?.key,100);
    const label=cleanString(raw?.label||key,120);
    if(!key||!label)throw new Error("Every form field requires a key and label.");
    if(seen.has(key))throw new Error("Duplicate form field key: "+key);
    seen.add(key);

    const fieldType=FIELD_TYPES.includes(raw?.fieldType)?raw.fieldType:"text";
    const section=["header","client","items","other"].includes(raw?.section)?raw.section:"header";
    const width=Math.min(12,Math.max(1,Number(raw?.width)||6));
    const options=Array.isArray(raw?.options)
      ? [...new Set(raw.options.map(item=>cleanString(item,200)).filter(Boolean))].slice(0,100)
      : [];

    return {
      key,
      label,
      visible:raw?.visible!==false,
      required:Boolean(raw?.required),
      locked:Boolean(raw?.locked),
      fieldType,
      width,
      order:Number.isFinite(Number(raw?.order))?Math.max(0,Number(raw.order)):index,
      section,
      options:fieldType==="select"?options:[],
      formula:fieldType==="number"||fieldType==="currency"?cleanString(raw?.formula,300):""
    };
  });
};

router.get("/:formKey",auth,async(req,res)=>{
  try{
    const formKey=cleanString(req.params.formKey,120);
    if(!formKey)return res.status(400).json({message:"Form key is required."});
    const config=await FormConfiguration.findOne({createdBy:owner(req),formKey}).lean();
    return res.json(config||{formKey,fields:[]});
  }catch(error){
    return res.status(500).json({message:error.message});
  }
});

router.put("/:formKey",auth,async(req,res)=>{
  try{
    const formKey=cleanString(req.params.formKey,120);
    if(!formKey)return res.status(400).json({message:"Form key is required."});
    const fields=sanitizeFields(req.body?.fields);

    const config=await FormConfiguration.findOneAndUpdate(
      {createdBy:new mongoose.Types.ObjectId(owner(req)),formKey},
      {$set:{fields}},
      {new:true,upsert:true,runValidators:true,setDefaultsOnInsert:true}
    ).lean();

    return res.json(config);
  }catch(error){
    return res.status(400).json({message:error.message});
  }
});

router.delete("/:formKey",auth,async(req,res)=>{
  try{
    const formKey=cleanString(req.params.formKey,120);
    await FormConfiguration.deleteOne({createdBy:owner(req),formKey});
    return res.json({message:"Form configuration reset successfully."});
  }catch(error){
    return res.status(500).json({message:error.message});
  }
});

module.exports=router;
