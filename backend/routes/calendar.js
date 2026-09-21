const express=require("express");
const mongoose=require("mongoose");
const Event=require("../models/Calendar");
const auth=require("../middleware/auth");
const router=express.Router();
const owner=req=>req.user.id;

router.get("/",auth,async(req,res)=>{
  try{
    const query={createdBy:owner(req)};
    if(req.query.start||req.query.end){
      query.start={};
      if(req.query.start)query.start.$gte=new Date(req.query.start);
      if(req.query.end)query.start.$lte=new Date(req.query.end);
    }
    res.json(await Event.find(query).sort({start:1}).lean());
  }catch(error){res.status(500).json({message:error.message});}
});

router.post("/",auth,async(req,res)=>{
  try{
    const title=String(req.body?.title||"").trim();
    if(!title)return res.status(400).json({message:"Event title is required."});
    const start=new Date(req.body?.start),end=req.body?.end?new Date(req.body.end):start;
    if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))return res.status(400).json({message:"Valid event dates are required."});
    if(end<start)return res.status(400).json({message:"Event end cannot be before start."});
    const event=await Event.create({title,start,end,color:req.body?.color||"",createdBy:owner(req)});
    res.status(201).json(event);
  }catch(error){res.status(400).json({message:error.message});}
});

router.put("/:id",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid event ID."});
    const event=await Event.findOne({_id:req.params.id,createdBy:owner(req)});
    if(!event)return res.status(404).json({message:"Event not found."});
    for(const key of ["title","color"])if(req.body?.[key]!==undefined)event[key]=String(req.body[key]);
    if(req.body?.start!==undefined)event.start=new Date(req.body.start);
    if(req.body?.end!==undefined)event.end=new Date(req.body.end);
    if(Number.isNaN(event.start.getTime())||Number.isNaN(event.end.getTime()))return res.status(400).json({message:"Valid event dates are required."});
    if(event.end<event.start)return res.status(400).json({message:"Event end cannot be before start."});
    await event.save();res.json(event);
  }catch(error){res.status(400).json({message:error.message});}
});

router.delete("/:id",auth,async(req,res)=>{
  try{if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid event ID."});const event=await Event.findOneAndDelete({_id:req.params.id,createdBy:owner(req)});if(!event)return res.status(404).json({message:"Event not found."});res.json({message:"Event deleted successfully."});}catch(error){res.status(500).json({message:error.message});}
});

module.exports=router;
