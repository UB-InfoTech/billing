const express=require("express");
const mongoose=require("mongoose");
const Event=require("../models/Calendar");
const auth=require("../middleware/auth");
const {applyWorkflows}=require("../utils/workflowEngine");

const router=express.Router();
const owner=req=>req.user.id;
const cleanCustomFields=value=>{
  if(!value||typeof value!=="object"||Array.isArray(value))return {};
  return Object.fromEntries(Object.entries(value).slice(0,100).map(([key,val])=>[String(key).slice(0,100),val]));
};
const validDate=value=>{
  const date=new Date(value);
  return Number.isNaN(date.getTime())?null:date;
};

router.get("/",auth,async(req,res)=>{
  try{
    const query={createdBy:owner(req)};
    const start=validDate(req.query.start);
    const end=validDate(req.query.end);
    if(start||end){
      query.start={};
      if(start)query.start.$gte=start;
      if(end)query.start.$lte=end;
    }
    res.json(await Event.find(query).sort({start:1}).lean());
  }catch(error){res.status(500).json({message:error.message});}
});

router.post("/",auth,async(req,res)=>{
  try{
    const title=String(req.body?.title||"").trim();
    const start=validDate(req.body?.start);
    const end=validDate(req.body?.end)||start;
    if(!title)return res.status(400).json({message:"Event title is required."});
    if(!start||!end)return res.status(400).json({message:"Valid event dates are required."});
    if(end<start)return res.status(400).json({message:"Event end cannot be before start."});

    const event=new Event({
      title,
      start,
      end,
      color:String(req.body?.color||"#3788d8").slice(0,20),
      customFields:cleanCustomFields(req.body?.customFields),
      createdBy:owner(req)
    });
    await applyWorkflows({resource:"calendar",event:"record_created",doc:event,createdBy:owner(req)});
    await event.save();
    res.status(201).json(event);
  }catch(error){res.status(400).json({message:error.message});}
});

router.put("/:id",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid event ID."});
    const event=await Event.findOne({_id:req.params.id,createdBy:owner(req)});
    if(!event)return res.status(404).json({message:"Event not found."});

    if(req.body?.title!==undefined)event.title=String(req.body.title).trim();
    if(req.body?.color!==undefined)event.color=String(req.body.color).slice(0,20);
    if(req.body?.start!==undefined){
      const start=validDate(req.body.start);
      if(!start)return res.status(400).json({message:"Valid start date/time is required."});
      event.start=start;
    }
    if(req.body?.end!==undefined){
      const end=validDate(req.body.end);
      if(!end)return res.status(400).json({message:"Valid end date/time is required."});
      event.end=end;
    }
    if(req.body?.customFields!==undefined)event.customFields=cleanCustomFields(req.body.customFields);
    if(!event.title)return res.status(400).json({message:"Event title is required."});
    if(event.end<event.start)return res.status(400).json({message:"Event end cannot be before start."});

    await applyWorkflows({resource:"calendar",event:"record_updated",doc:event,createdBy:owner(req)});
    await event.save();
    res.json(event);
  }catch(error){res.status(400).json({message:error.message});}
});

router.delete("/:id",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid event ID."});
    const event=await Event.findOneAndDelete({_id:req.params.id,createdBy:owner(req)});
    if(!event)return res.status(404).json({message:"Event not found."});
    res.json({message:"Event deleted successfully."});
  }catch(error){res.status(500).json({message:error.message});}
});

module.exports=router;
