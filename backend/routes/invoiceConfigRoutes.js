const express=require("express");
const mongoose=require("mongoose");
const multer=require("multer");
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const InvoiceConfiguration=require("../models/InvoiceConfiguration");
const auth=require("../middleware/auth");
const {getSafeUploadExtension}=require("../utils/uploadFileTypes");
const {hasInvoiceBackgroundSignature}=require("../utils/invoiceBackground");
const {createDefaultInvoiceDesign,sanitizeInvoiceDesign}=require("../utils/invoiceDesign");

const router=express.Router();
const owner=req=>String(req.user.id);
const clean=(value,max)=>String(value??"").trim().slice(0,max);
const backgroundDirectory=path.join(__dirname,"../public/uploads/invoice-designs");
fs.mkdirSync(backgroundDirectory,{recursive:true});

const backgroundUpload=multer({
  storage:multer.diskStorage({
    destination:(_,__,callback)=>callback(null,backgroundDirectory),
    filename:(req,file,callback)=>{
      const accountId=owner(req);
      const extension=getSafeUploadExtension(file.mimetype);
      if(!/^[a-f0-9]{24}$/i.test(accountId)||!extension||!["application/pdf","image/jpeg","image/png","image/webp"].includes(String(file.mimetype||"").toLowerCase())){
        return callback(new Error("Choose a PDF, JPG, PNG or WebP invoice design."));
      }
      callback(null,accountId+"-"+crypto.randomBytes(12).toString("hex")+extension);
    }
  }),
  limits:{files:1,fileSize:12*1024*1024},
  fileFilter:(_,file,callback)=>{
    if(!["application/pdf","image/jpeg","image/png","image/webp"].includes(String(file.mimetype||"").toLowerCase())){
      return callback(new Error("Choose a PDF, JPG, PNG or WebP invoice design."));
    }
    return callback(null,true);
  }
});

const receiveBackground=(req,res,next)=>{
  backgroundUpload.single("background")(req,res,async error=>{
    if(error){
      if(req.file?.path)await fs.promises.unlink(req.file.path).catch(()=>{});
      const status=error.code==="LIMIT_FILE_SIZE"?413:400;
      const message=error.code==="LIMIT_FILE_SIZE"
        ?"Invoice design files must be 12 MB or smaller."
        :error.message||"Unable to upload the invoice design.";
      return res.status(status).json({message});
    }
    if(!req.file)return res.status(400).json({message:"Choose a PDF or image first."});
    let valid=false;
    try{
      const buffer=await fs.promises.readFile(req.file.path);
      valid=hasInvoiceBackgroundSignature(buffer,req.file.mimetype);
    }catch(readError){
      console.warn("Unable to verify invoice background:",readError.message);
    }
    if(!valid){
      await fs.promises.unlink(req.file.path).catch(()=>{});
      return res.status(400).json({message:"This file does not match a supported PDF or image format."});
    }
    return next();
  });
};

const DEFAULT_COLUMNS=[
  ["sr","Sr",5],["description","Desc.",17],["designNumber","Design No.",13],["hsnCode","HSN",9],
  ["quantity","Qty",8],["qtyUnit","Unit",5],["cut","Cut",7],["MTR","MTR",7],
  ["unitPrice","Rate",8],["amount","Amount",8],["discount","Disc.",7],["taxable","Taxable",12]
];

const defaults=()=>({
  pageSize:"A4",
  accentColor:"#111827",
  invoiceTitle:"TAX INVOICE",
  header:{showHeaderTitle:true,showCompanyName:true,showGST:true,showPhones:true,showAddress:true},
  receiver:{showName:true,showAddress:true,showMobile:true,showState:true,showGSTIN:true},
  invoiceDetails:{showChallan:true,showInvoiceNo:true,showInvoiceDate:true,showDueDate:true,showPaymentTerms:true,showEwayBill:true},
  itemColumns:DEFAULT_COLUMNS.map(([key,label,width],order)=>({key,label,width,visible:true,order})),
  design:createDefaultInvoiceDesign(),
  summary:{showDiscount:true,showTax:true,showRoundOff:true,showBankDetails:true,showTerms:true,showWebCredit:true}
});

const sanitize=(input={},ownerId)=>{
  const base=defaults();
  const itemMap=new Map(base.itemColumns.map(item=>[item.key,item]));
  const incoming=Array.isArray(input.itemColumns)?input.itemColumns:[];
  incoming.slice(0,30).forEach((item,index)=>{
    const key=clean(item?.key,50);
    const original=itemMap.get(key);
    if(!original)return;
    itemMap.set(key,{
      ...original,
      label:clean(item?.label||original.label,80)||original.label,
      visible:item?.visible!==false,
      width:Math.min(30,Math.max(3,Number(item?.width)||original.width)),
      order:Number.isFinite(Number(item?.order))?Math.max(0,Number(item.order)):index
    });
  });
  return {
    pageSize:["A4","A5","Letter"].includes(input?.pageSize)?input.pageSize:base.pageSize,
    accentColor:/^#[0-9A-F]{6}$/i.test(String(input?.accentColor||""))?String(input.accentColor):base.accentColor,
    invoiceTitle:clean(input?.invoiceTitle||base.invoiceTitle,80)||base.invoiceTitle,
    header:{...base.header,...(input?.header||{})},
    receiver:{...base.receiver,...(input?.receiver||{})},
    invoiceDetails:{...base.invoiceDetails,...(input?.invoiceDetails||{})},
    itemColumns:[...itemMap.values()].sort((a,b)=>(a.order||0)-(b.order||0)).map((item,index)=>({...item,order:index})),
    design:sanitizeInvoiceDesign(input?.design,ownerId),
    summary:{...base.summary,...(input?.summary||{})}
  };
};

router.post("/background",auth,receiveBackground,async(req,res)=>{
  const extension=getSafeUploadExtension(req.file.mimetype);
  const type=extension===".pdf"?"pdf":"image";
  return res.status(201).json({
    url:"/uploads/invoice-designs/"+req.file.filename,
    type,
    name:clean(req.file.originalname,120)||"Imported invoice design"
  });
});

router.get("/",auth,async(req,res)=>{
  try{
    const saved=await InvoiceConfiguration.findOne({createdBy:owner(req)}).lean();
    return res.json(saved?sanitize(saved,owner(req)):sanitize({},owner(req)));
  }catch(error){return res.status(500).json({message:error.message});}
});

router.put("/",auth,async(req,res)=>{
  try{
    const config=sanitize(req.body||{},owner(req));
    const saved=await InvoiceConfiguration.findOneAndUpdate(
      {createdBy:new mongoose.Types.ObjectId(owner(req))},
      {$set:config},
      {new:true,upsert:true,runValidators:true,setDefaultsOnInsert:true}
    ).lean();
    return res.json(sanitize(saved,owner(req)));
  }catch(error){return res.status(400).json({message:error.message});}
});

router.post("/reset",auth,async(req,res)=>{
  try{
    const saved=await InvoiceConfiguration.findOneAndUpdate(
      {createdBy:new mongoose.Types.ObjectId(owner(req))},
      {$set:defaults()},
      {new:true,upsert:true,runValidators:true,setDefaultsOnInsert:true}
    ).lean();
    return res.json(sanitize(saved,owner(req)));
  }catch(error){return res.status(400).json({message:error.message});}
});

module.exports=router;
