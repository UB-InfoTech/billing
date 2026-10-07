const express=require("express");
const mongoose=require("mongoose");
const auth=require("../middleware/auth");
const WorkflowDefinition=require("../models/WorkflowDefinition");

const router=express.Router();
const owner=req=>new mongoose.Types.ObjectId(req.user.id);

const clean=workflow=>({
  name:String(workflow?.name||"").trim().slice(0,120),
  active:workflow?.active!==false,
  trigger:{
    event:["record_created","record_updated"].includes(workflow?.trigger?.event)?workflow.trigger.event:"record_updated",
    resource:["orders","clients","products","expenses"].includes(workflow?.trigger?.resource)?workflow.trigger.resource:"orders"
  },
  conditions:Array.isArray(workflow?.conditions)?workflow.conditions.slice(0,20).map(item=>({
    fieldKey:String(item?.fieldKey||"").trim().slice(0,100),
    operator:["equals","not_equals","contains","not_contains","greater_than","less_than","empty","not_empty"].includes(item?.operator)?item.operator:"equals",
    value:String(item?.value??"").slice(0,300)
  })).filter(item=>item.fieldKey):[],
  actions:Array.isArray(workflow?.actions)?workflow.actions.slice(0,20).map(item=>({
    type:["set_value","change_status","show_message"].includes(item?.type)?item.type:"set_value",
    fieldKey:String(item?.fieldKey||"").trim().slice(0,100),
    value:item?.value??"",
    message:String(item?.message||"").slice(0,500)
  })).filter(item=>item.type==="show_message"||item.fieldKey):[]
});

router.get("/",auth,async(req,res)=>{
  try{
    const workflows=await WorkflowDefinition.find({createdBy:owner(req)}).sort({updatedAt:-1}).lean();
    res.json({workflows});
  }catch(error){res.status(500).json({message:"Unable to load workflows."});}
});

router.post("/",auth,async(req,res)=>{
  try{
    const payload=clean(req.body);
    if(!payload.name)return res.status(400).json({message:"Give this workflow a simple name."});
    const workflow=await WorkflowDefinition.create({...payload,createdBy:owner(req)});
    res.status(201).json(workflow);
  }catch(error){res.status(400).json({message:error.message||"Unable to create workflow."});}
});

router.put("/:id",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"This workflow could not be found."});
    const payload=clean(req.body);
    if(!payload.name)return res.status(400).json({message:"Give this workflow a simple name."});
    const workflow=await WorkflowDefinition.findOneAndUpdate(
      {_id:req.params.id,createdBy:owner(req)},
      {$set:payload},
      {new:true,runValidators:true}
    ).lean();
    if(!workflow)return res.status(404).json({message:"Workflow not found."});
    res.json(workflow);
  }catch(error){res.status(400).json({message:error.message||"Unable to save workflow."});}
});

router.delete("/:id",auth,async(req,res)=>{
  try{
    const deleted=await WorkflowDefinition.deleteOne({_id:req.params.id,createdBy:owner(req)});
    if(!deleted.deletedCount)return res.status(404).json({message:"Workflow not found."});
    res.json({message:"Workflow removed."});
  }catch(error){res.status(500).json({message:"Unable to remove workflow."});}
});

module.exports=router;
