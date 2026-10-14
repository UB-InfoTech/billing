const express=require("express");
const multer=require("multer");
const fs=require("fs");
const path=require("path");
const mongoose=require("mongoose");
const Expense=require("../models/Expense");
const {applyWorkflows}=require("../utils/workflowEngine");
const Client=require("../models/Client");
const Order=require("../models/Order2");
const auth=require("../middleware/auth");
const {buildExpenseDateRange}=require("../utils/expenseDateRange");
const {normalizeExpenseFinancials}=require("../utils/expenseFinancials");
const {getSafeUploadExtension,isAllowedUploadType}=require("../utils/uploadFileTypes");
const router=express.Router();
const uploadDir=path.join(__dirname,"../public/uploads/expenses");
fs.mkdirSync(uploadDir,{recursive:true});
const upload=multer({
  storage:multer.diskStorage({
    destination:(_,__,cb)=>cb(null,uploadDir),
    filename:(_,file,cb)=>{
      const ext=getSafeUploadExtension(file.mimetype);
      if(!ext)return cb(new Error("Only JPG, PNG, GIF, WebP or PDF receipts are supported."));
      cb(null,Date.now()+"-"+Math.random().toString(36).slice(2,9)+ext);
    }
  }),
  limits:{fileSize:10*1024*1024},
  fileFilter:(_,file,cb)=>{
    if(!isAllowedUploadType(file.mimetype,true)){
      return cb(new Error("Only JPG, PNG, GIF, WebP or PDF receipts are supported."));
    }
    return cb(null,true);
  }
});
const owner=req=>req.user.id;
const round2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;

async function discardExpenseUpload(file){
  if(!file?.path)return;
  try{await fs.promises.unlink(file.path);}catch(error){if(error.code!=="ENOENT")console.error("Failed to clean up rejected expense receipt:",error);}
}

const receiveExpenseReceipt=(req,res,next)=>{
  upload.single("receipt")(req,res,async error=>{
    if(!error)return next();
    await discardExpenseUpload(req.file);
    const status=error.code==="LIMIT_FILE_SIZE"?413:400;
    const message=error.code==="LIMIT_FILE_SIZE"
      ?"Each receipt must be 10 MB or smaller."
      :error.code==="LIMIT_UNEXPECTED_FILE"
        ?"Upload one receipt at a time."
        :error.message||"Unable to upload the receipt.";
    return res.status(status).json({message});
  });
};

function referenceError(message){
  const error=new Error(message);
  error.status=400;
  return error;
}

async function validateReferenceOwnership({clientId,orderId},createdBy){
  const clientValue=String(clientId||"").trim();
  if(clientValue){
    if(!mongoose.isValidObjectId(clientValue)){
      throw referenceError("Choose a valid customer for this expense.");
    }
    const client=await Client.findOne({_id:clientValue,createdBy}).select("_id").lean();
    if(!client)throw referenceError("The selected customer does not belong to this business.");
  }

  const orderValue=String(orderId||"").trim();
  if(orderValue){
    if(!mongoose.isValidObjectId(orderValue)){
      throw referenceError("Choose a valid invoice for this expense.");
    }
    const order=await Order.findOne({_id:orderValue,createdBy}).select("_id").lean();
    if(!order)throw referenceError("The selected invoice does not belong to this business.");
  }
}


function applyExpenseFilters(query,params={}){
  const search=String(params.search||"").trim();
  if(search){
    const specialCharacters=new Set([
      ".", "*", "+", "?", "^", "$", "(", ")", "|", "[", "]", "{", "}",
      String.fromCharCode(92)
    ]);
    const slash=String.fromCharCode(92);
    const escaped=Array.from(search,character=>
      specialCharacters.has(character)?slash+character:character
    ).join("");
    const regex=new RegExp(escaped,"i");
    query.$or=[
      {description:regex},
      {vendor:regex},
      {category:regex},
      {gstNo:regex},
      {title:regex}
    ];
  }
  if(params.category)query.category=String(params.category).trim();
  const range=buildExpenseDateRange(params);
  if(range)query.date=range;
  return query;
}

router.get("/summary",auth,async(req,res)=>{
  try{
    const match=applyExpenseFilters(
      {createdBy:new mongoose.Types.ObjectId(owner(req))},
      req.query
    );
    const totalIncludingTax={$add:[{$ifNull:["$amount",0]},{$ifNull:["$taxAmount",0]}]};
    const [summary,categories,vendors,top]=await Promise.all([
      Expense.aggregate([{$match:match},{$group:{
        _id:null,
        total:{$sum:"$amount"},
        tax:{$sum:{$ifNull:["$taxAmount",0]}},
        totalSpent:{$sum:totalIncludingTax},
        count:{$sum:1},
        average:{$avg:"$amount"},
        averageTotalSpent:{$avg:totalIncludingTax}
      }}]),
      Expense.aggregate([{$match:match},{$group:{_id:"$category",total:{$sum:"$amount"},count:{$sum:1}}},{$sort:{total:-1}}]),
      Expense.aggregate([{$match:match},{ $match:{vendor:{$ne:""}}},{$group:{_id:"$vendor",total:{$sum:"$amount"},count:{$sum:1}}},{$sort:{total:-1}},{$limit:10}]),
      Expense.find(match).sort({amount:-1}).limit(10).lean()
    ]);
    res.json({
      // Keep the base expense amount for accounting metrics; use totalSpent
      // for the day-to-day cash outflow shown to users (amount plus tax).
      totalExpense:round2(summary[0]?.total),
      totalTax:round2(summary[0]?.tax),
      totalSpent:round2(summary[0]?.totalSpent),
      expenseCount:summary[0]?.count||0,
      averageExpense:round2(summary[0]?.average),
      averageTotalSpent:round2(summary[0]?.averageTotalSpent),
      categoryBreakdown:categories,
      vendorBreakdown:vendors,
      topExpenses:top
    });
  }catch(error){res.status(error.status||500).json({message:error.message});}
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
    const query=applyExpenseFilters({createdBy:owner(req)},req.query);
    if(req.query.clientId&&mongoose.isValidObjectId(req.query.clientId))query.clientId=req.query.clientId;
    if(req.query.orderId&&mongoose.isValidObjectId(req.query.orderId))query.orderId=req.query.orderId;
    const [expenses,total]=await Promise.all([Expense.find(query).sort({[sortField]:sortDir}).skip((page-1)*limit).limit(limit).populate({path:"clientId",select:"name companyName",match:{createdBy:owner(req)}}).populate({path:"orderId",select:"orderNumber",match:{createdBy:owner(req)}}).lean(),Expense.countDocuments(query)]);
    res.json({expenses,total,page,limit,pages:Math.max(1,Math.ceil(total/limit))});
  }catch(error){res.status(error.status||500).json({message:error.message});}
});

router.get("/:id",auth,async(req,res)=>{
  try{if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid expense ID."});const expense=await Expense.findOne({_id:req.params.id,createdBy:owner(req)}).populate({path:"clientId",select:"name companyName",match:{createdBy:owner(req)}}).populate({path:"orderId",select:"orderNumber",match:{createdBy:owner(req)}}).lean();if(!expense)return res.status(404).json({message:"Expense not found."});res.json(expense);}catch(error){res.status(500).json({message:error.message});}
});

router.post("/",auth,async(req,res)=>{
  try{
    const body=req.body||{};
    if(!body.description||!String(body.description).trim()){
      return res.status(400).json({message:"Description is required."});
    }
    await validateReferenceOwnership(body,owner(req));
    const financials=normalizeExpenseFinancials(body.amount,body.taxRate);
    const expense=new Expense({
      ...body,
      ...financials,
      title:String(body.title||body.description||"").trim(),
      createdBy:owner(req),
      updatedBy:owner(req),
      user:owner(req)
    });
    await applyWorkflows({resource:"expenses",event:"record_created",doc:expense,createdBy:owner(req)});
    Object.assign(expense,normalizeExpenseFinancials(expense.amount,expense.taxRate));
    await expense.save();
    res.status(201).json(expense);
  }catch(error){
    res.status(error.status||400).json({message:error.message});
  }
});

router.put("/:id",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id)){
      return res.status(400).json({message:"Invalid expense ID."});
    }
    const expense=await Expense.findOne({_id:req.params.id,createdBy:owner(req)});
    if(!expense)return res.status(404).json({message:"Expense not found."});

    const body=req.body||{};
    await validateReferenceOwnership(
      {clientId:body.clientId,orderId:body.orderId},
      owner(req)
    );
    const allowed=[
      "title","description","amount","category","subCategory","tags",
      "paymentMethod","currency","vendor","gstNo","taxDeductible","taxRate",
      "clientId","orderId","date","isRecurring","recurringInterval",
      "recurringEndDate","notes","attachments","receipt","customFields"
    ];
    for(const key of allowed){
      if(body[key]!==undefined)expense[key]=body[key];
    }

    Object.assign(expense,normalizeExpenseFinancials(expense.amount,expense.taxRate));
    expense.updatedBy=owner(req);
    await applyWorkflows({resource:"expenses",event:"record_updated",doc:expense,createdBy:owner(req)});
    Object.assign(expense,normalizeExpenseFinancials(expense.amount,expense.taxRate));
    await expense.save();
    res.json(expense);
  }catch(error){
    res.status(error.status||400).json({message:error.message});
  }
});

router.post("/upload-receipt",auth,receiveExpenseReceipt,async(req,res)=>{
  try{
    if(!req.file)return res.status(400).json({message:"Choose a receipt file first."});
    return res.status(201).json({
      receiptUrl:"/uploads/expenses/"+req.file.filename,
      filename:req.file.filename
    });
  }catch(error){
    await discardExpenseUpload(req.file);
    return res.status(400).json({message:error.message||"Unable to upload the receipt."});
  }
});

router.delete("/:id",auth,async(req,res)=>{try{if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid expense ID."});const expense=await Expense.findOneAndDelete({_id:req.params.id,createdBy:owner(req)});if(!expense)return res.status(404).json({message:"Expense not found."});res.json({message:"Expense deleted successfully."});}catch(error){res.status(500).json({message:error.message});}});

module.exports=router;