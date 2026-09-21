const express=require("express");
const multer=require("multer");
const fs=require("fs");
const path=require("path");
const bwipjs=require("bwip-js");
const mongoose=require("mongoose");
const Product=require("../models/Product");
const auth=require("../middleware/auth");

const router=express.Router();
const uploadDir=path.join(__dirname,"../public/uploads/products");
fs.mkdirSync(uploadDir,{recursive:true});

const storage=multer.diskStorage({
  destination:(_,__,cb)=>cb(null,uploadDir),
  filename:(_,file,cb)=>{
    const ext=path.extname(file.originalname||"").toLowerCase();
    cb(null,Date.now()+"-"+Math.random().toString(36).slice(2,10)+ext);
  }
});
const upload=multer({storage,limits:{files:5,fileSize:5*1024*1024},fileFilter:(_,file,cb)=>{
  if(new RegExp("^image/(jpeg|png|webp|gif)$","i").test(file.mimetype))return cb(null,true);
  cb(new Error("Only image files are allowed."));
}});

function owner(req){return req.user?.id;}
function publicUrl(req,filePath){return req.protocol+"://"+req.get("host")+filePath;}
async function nextProductCode(){
  for(let i=0;i<10;i++){
    const code="P"+Date.now().toString().slice(-7)+Math.floor(Math.random()*10);
    if(!(await Product.exists({productCode:code})))return code;
  }
  throw new Error("Unable to generate a unique product code.");
}
function safeSort(key){return ["productName","productCode","rate","quantity","createdAt","updatedAt","designNo"].includes(key)?key:"createdAt";}

router.get("/barcode/:code",auth,async(req,res)=>{
  try{
    const product=await Product.findOne({createdBy:owner(req),$or:[{productCode:req.params.code},{barcode:req.params.code}]}).lean();
    if(!product)return res.status(404).json({message:"Product not found."});
    res.json({product});
  }catch(error){res.status(500).json({message:error.message});}
});

router.get("/barcode-image/:code",auth,async(req,res)=>{
  try{
    const product=await Product.findOne({createdBy:owner(req),productCode:req.params.code}).lean();
    if(!product)return res.status(404).json({message:"Product not found."});
    const png=await bwipjs.toBuffer({bcid:"code128",text:product.productCode,scale:3,height:12,includetext:true,textxalign:"center"});
    res.set("Content-Type","image/png");
    res.send(png);
  }catch(error){res.status(500).json({message:error.message});}
});

router.get("/",auth,async(req,res)=>{
  try{
    const search=String(req.query.search||"").trim();
    const page=Math.max(parseInt(req.query.page,10)||1,1);
    const limit=Math.min(Math.max(parseInt(req.query.limit,10)||20,1),100);
    const sortBy=safeSort(String(req.query.sort||"createdAt"));
    const sortDir=String(req.query.order||"desc")==="asc"?1:-1;
    const query={createdBy:owner(req)};
    if(search){
      const rx=new RegExp(search.replace(/[.*+?^${}()|[\\]\\\\]/g,"\\\\$&"),"i");
      query.$or=[{productName:rx},{productCode:rx},{designNo:rx},{serialNumber:rx}];
    }
    if(req.query.lowStock==="true")query.$expr={$lte:["$quantity","$minStock"]};
    const [products,total]=await Promise.all([
      Product.find(query).sort({[sortBy]:sortDir}).skip((page-1)*limit).limit(limit).lean(),
      Product.countDocuments(query)
    ]);
    res.json({products,total,page,limit,pages:Math.max(1,Math.ceil(total/limit))});
  }catch(error){res.status(500).json({message:error.message});}
});

router.get("/:id",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid product ID."});
    const product=await Product.findOne({_id:req.params.id,createdBy:owner(req)}).lean();
    if(!product)return res.status(404).json({message:"Product not found."});
    res.json(product);
  }catch(error){res.status(500).json({message:error.message});}
});

router.post("/",auth,upload.array("images",5),async(req,res)=>{
  try{
    const code=String(req.body.productCode||"").trim().toUpperCase()||await nextProductCode();
    if(await Product.exists({createdBy:owner(req),productCode:code}))return res.status(409).json({message:"Product code already exists."});
    const product=new Product({
      productName:String(req.body.productName||"").trim(),productCode:code,
      description:String(req.body.description||"").trim(),rate:Number(req.body.rate||0),
      quantity:Number(req.body.quantity||0),serialNumber:String(req.body.serialNumber||"").trim()||undefined,
      designNo:String(req.body.designNo||"").trim(),purchaseDate:req.body.purchaseDate||null,
      purchasePrice:Number(req.body.purchasePrice||0),barcode:String(req.body.barcode||code).trim(),
      minStock:Number(req.body.minStock||0),createdBy:owner(req),
      images:(req.files||[]).map(file=>publicUrl(req,"/uploads/products/"+file.filename))
    });
    if(!product.productName)return res.status(400).json({message:"Product name is required."});
    if(product.rate<0||product.quantity<0)return res.status(400).json({message:"Rate and quantity cannot be negative."});
    await product.save();
    res.status(201).json({message:"Product created successfully.",product});
  }catch(error){res.status(400).json({message:error.message});}
});

router.put("/:id",auth,upload.array("images",5),async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid product ID."});
    const product=await Product.findOne({_id:req.params.id,createdBy:owner(req)});
    if(!product)return res.status(404).json({message:"Product not found."});
    for(const field of ["productName","description","designNo","barcode"])if(req.body[field]!==undefined)product[field]=String(req.body[field]).trim();
    for(const field of ["rate","quantity","purchasePrice","minStock"])if(req.body[field]!==undefined)product[field]=Number(req.body[field]);
    if(req.body.productCode && String(req.body.productCode).trim().toUpperCase()!==product.productCode){
      const code=String(req.body.productCode).trim().toUpperCase();
      if(await Product.exists({createdBy:owner(req),productCode:code,_id:{$ne:product._id}}))return res.status(409).json({message:"Product code already exists."});
      product.productCode=code;
    }
    if(req.body.serialNumber!==undefined)product.serialNumber=String(req.body.serialNumber).trim()||undefined;
    if(req.body.purchaseDate!==undefined)product.purchaseDate=req.body.purchaseDate||null;
    if((req.files||[]).length)product.images=[...(product.images||[]),...(req.files||[]).map(file=>publicUrl(req,"/uploads/products/"+file.filename))];
    if(product.rate<0||product.quantity<0||product.minStock<0)return res.status(400).json({message:"Stock and pricing values cannot be negative."});
    await product.save();
    res.json({message:"Product updated successfully.",product});
  }catch(error){res.status(400).json({message:error.message});}
});

router.patch("/:id/stock",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid product ID."});
    const delta=Number(req.body.quantity);
    if(!Number.isFinite(delta)||delta===0)return res.status(400).json({message:"quantity delta is required."});
    const product=await Product.findOne({_id:req.params.id,createdBy:owner(req)});
    if(!product)return res.status(404).json({message:"Product not found."});
    const next=Number(product.quantity||0)+delta;
    if(next<0)return res.status(400).json({message:"Insufficient stock."});
    product.quantity=next;await product.save();
    res.json({message:"Stock updated successfully.",product});
  }catch(error){res.status(400).json({message:error.message});}
});

router.delete("/:id",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid product ID."});
    const product=await Product.findOneAndDelete({_id:req.params.id,createdBy:owner(req)});
    if(!product)return res.status(404).json({message:"Product not found."});
    res.json({message:"Product deleted successfully."});
  }catch(error){res.status(500).json({message:error.message});}
});

module.exports=router;