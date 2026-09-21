const express=require("express");
const multer=require("multer");
const fs=require("fs");
const path=require("path");
const mongoose=require("mongoose");
const Expense=require("../models/Expense");
const Client=require("../models/Client");
const Order=require("../models/Order2");
const auth=require("../middleware/auth");
const router=express.Router();
const uploadDir=path.join(__dirname,"../public/uploads/expenses");
fs.mkdirSync(uploadDir,{recursive:true});
const upload=multer({
  storage:multer.diskStorage({destination:(_,__,cb)=>cb(null,uploadDir),filename:(_,file,cb)=>cb(null,Date.now()+"-"+Math.random().toString(36).slice(2,9)+path.extname(file.originalname||"").toLowerCase())}),
  limits:{fileSize:10*1024*1024},
  fileFilter:(_,file,cb)=>cb(null,/^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype)||file.mimetype==="application/pdf")
});
const owner=req=>req.user.id;
const round2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;

router.get("/summary",auth,async(req,res)=>{
  try{
    const match={createdBy:new mongoose.Types.ObjectId(owner(req))};
    if(req.query.startDate||req.query.endDate){match.date={};if(req.query.startDate)match.date.$gte=new Date(req.query.startDate+"T00:00:00.000");if(req.query.endDate)match.date.$lte=new Date(req.query.endDate+"T23:59:59.999");}
    const [summary,categories,vendors,top]=await Promise.all([
      Expense.aggregate([{$match:match},{$group:{_id:null,total:{$sum:"$amount"},count:{$sum:1},average:{$avg:"$amount"}}}]),
      Expense.aggregate([{$match:match},{$group:{_id:"$category",total:{$sum:"$amount"},count:{$sum:1}}},{$sort:{total:-1}}]),
      Expense.aggregate([{$match:match},{ $match:{vendor:{$ne:""}}},{$group:{_id:"$vendor",total:{$sum:"$amount"},count:{$sum:1}}},{$sort:{total:-1}},{$limit:10}]),
      Expense.find(match).sort({amount:-1}).limit(10).lean()
    ]);
    res.json({totalExpense:round2(summary[0]?.total),expenseCount:summary[0]?.count||0,averageExpense:round2(summary[0]?.average),categoryBreakdown:categories,vendorBreakdown:vendors,topExpenses:top});
  }catch(error){res.status(500).json({message:error.message});}
});

router.get("/linked/options",auth,async(req,res)=>{
  try{
    const [clients,orders]=await Promise.all([
      Client.find({createdBy:owner(req),accountStatus:"Active"}).select("name companyName").sort({companyName:1,name:1}).lean(),
      Order.find({createdBy:owner(req)}).select("orderNumber companyName orderDate").sort({orderDate:-1}).limit(100).lean()
    ]);
    res.json({clients,orders});
  }catch(error){res.status(500).json({message:error.message});}
});

router.get("/",auth,async(req,res)=>{
  try{
    const page=Math.max(parseInt(req.query.page,10)||1,1),limit=Math.min(Math.max(parseInt(req.query.limit,10)||20,1),100);
    const sortField=["date","amount","category","vendor","createdAt"].includes(req.query.sortBy)?req.query.sortBy:"date",sortDir=req.query.sortDir==="asc"?1:-1;
    const query={createdBy:owner(req)},search=String(req.query.search||"").trim();
    if(search){const rx=new RegExp(search.replace(/[.*+?^$()|[\\]\\\\]/g,"\\\\$&"),"i");query.$or=[{description:rx},{vendor:rx},{category:rx},{gstNo:rx},{title:rx}];}
    if(req.query.category)query.category=req.query.category;
    if(req.query.clientId&&mongoose.isValidObjectId(req.query.clientId))query.clientId=req.query.clientId;
    if(req.query.orderId&&mongoose.isValidObjectId(req.query.orderId))query.orderId=req.query.orderId;
    if(req.query.startDate||req.query.endDate){query.date={};if(req.query.startDate)query.date.$gte=new Date(req.query.startDate+"T00:00:00.000");if(req.query.endDate)query.date.$lte=new Date(req.query.endDate+"T23:59:59.999");}
    const [expenses,total]=await Promise.all([Expense.find(query).sort({[sortField]:sortDir}).skip((page-1)*limit).limit(limit).populate("clientId","name companyName").populate("orderId","orderNumber").lean(),Expense.countDocuments(query)]);
    res.json({expenses,total,page,limit,pages:Math.max(1,Math.ceil(total/limit))});
  }catch(error){res.status(500).json({message:error.message});}
});

router.get("/:id",auth,async(req,res)=>{
  try{if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid expense ID."});const expense=await Expense.findOne({_id:req.params.id,createdBy:owner(req)}).populate("clientId","name companyName").populate("orderId","orderNumber").lean();if(!expense)return res.status(404).json({message:"Expense not found."});res.json(expense);}catch(error){res.status(500).json({message:error.message});}
});

router.post("/",auth,async(req,res)=>{
  try{const body=req.body||{},amount=Number(body.amount);if(!body.description||!String(body.description).trim())return res.status(400).json({message:"Description is required."});if(!Number.isFinite(amount)||amount<=0)return res.status(400).json({message:"Amount must be greater than zero."});const taxRate=Math.min(100,Math.max(0,Number(body.taxRate||0)));const expense=new Expense({...body,title:String(body.title||body.description||"").trim(),amount,taxRate,taxAmount:round2(amount*taxRate/100),createdBy:owner(req),updatedBy:owner(req),user:owner(req)});await expense.save();res.status(201).json(expense);}catch(error){res.status(400).json({message:error.message});}
});

router.put("/:id",auth,async(req,res)=>{
  try{if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid expense ID."});const expense=await Expense.findOne({_id:req.params.id,createdBy:owner(req)});if(!expense)return res.status(404).json({message:"Expense not found."});const allowed=["title","description","amount","category","subCategory","tags","paymentMethod","currency","vendor","gstNo","taxDeductible","taxRate","clientId","orderId","date","isRecurring","recurringInterval","recurringEndDate","notes","attachments","receipt"];for(const key of allowed)if(req.body[key]!==undefined)expense[key]=req.body[key];expense.amount=Number(expense.amount||0);expense.taxRate=Math.min(100,Math.max(0,Number(expense.taxRate||0)));expense.taxAmount=round2(expense.amount*expense.taxRate/100);expense.updatedBy=owner(req);await expense.save();res.json(expense);}catch(error){res.status(400).json({message:error.message});}
});

router.post("/upload-receipt",auth,upload.single("receipt"),async(req,res)=>{try{if(!req.file)return res.status(400).json({message:"Receipt file is required."});res.status(201).json({receiptUrl:"/uploads/expenses/"+req.file.filename,filename:req.file.filename});}catch(error){res.status(400).json({message:error.message});}});

router.delete("/:id",auth,async(req,res)=>{try{if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid expense ID."});const expense=await Expense.findOneAndDelete({_id:req.params.id,createdBy:owner(req)});if(!expense)return res.status(404).json({message:"Expense not found."});res.json({message:"Expense deleted successfully."});}catch(error){res.status(500).json({message:error.message});}});

module.exports=router;