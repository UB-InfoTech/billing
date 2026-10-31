const express=require("express");
const {applyWorkflows}=require("../utils/workflowEngine");
const multer=require("multer");
const fs=require("fs");
const path=require("path");
const bwipjs=require("bwip-js");
const mongoose=require("mongoose");
const Product=require("../models/Product");
const Order=require("../models/Order2");
const CreditNote=require("../models/CreditNote");
const auth=require("../middleware/auth");
const {getSafeUploadExtension,isAllowedUploadType}=require("../utils/uploadFileTypes");
const {escapeRegex}=require("../utils/escapeRegex");
const {normalizeProductWriteError}=require("../utils/productWriteError");
const {
  loadConfiguredFormFields,
  calculateConfiguredCustomFields,
  hasConfiguredCustomCalculations
}=require("../utils/customFieldCalculations");
const {
  getConfiguredFieldState,
  prepareConfiguredFormValues,
  validateConfiguredFormValues
}=require("../utils/configuredFormValidation");

const router=express.Router();
const uploadDir=path.join(__dirname,"../public/uploads/products");
fs.mkdirSync(uploadDir,{recursive:true});

const storage=multer.diskStorage({
  destination:(_,__,cb)=>cb(null,uploadDir),
  filename:(_,file,cb)=>{
    const ext=getSafeUploadExtension(file.mimetype);
    if(!ext||ext===".pdf")return cb(new Error("Only supported image files are allowed."));
    cb(null,Date.now()+"-"+Math.random().toString(36).slice(2,10)+ext);
  }
});
const upload=multer({storage,limits:{files:5,fileSize:5*1024*1024},fileFilter:(_,file,cb)=>{
  if(!isAllowedUploadType(file.mimetype,false)){
    return cb(new Error("Only JPG, PNG, GIF or WebP product images are supported."));
  }
  return cb(null,true);
}});

async function discardUploadedFiles(files=[]){
  await Promise.allSettled((Array.isArray(files)?files:[]).map(file=>
    file?.path?fs.promises.unlink(file.path):Promise.resolve()
  ));
}

const receiveProductImages=(req,res,next)=>{
  upload.array("images",5)(req,res,async error=>{
    if(!error)return next();
    await discardUploadedFiles(req.files);
    const status=error.code==="LIMIT_FILE_SIZE"?413:400;
    const message=error.code==="LIMIT_FILE_SIZE"
      ?"Each product image must be 5 MB or smaller."
      :error.code==="LIMIT_FILE_COUNT"||error.code==="LIMIT_UNEXPECTED_FILE"
        ?"Upload no more than 5 product images at a time."
        :error.message||"Unable to upload product images.";
    return res.status(status).json({message});
  });
};

function owner(req){return req.user?.id;}
function publicUrl(req,filePath){return req.protocol+"://"+req.get("host")+filePath;}
async function nextProductCode(createdBy){
  for(let i=0;i<10;i++){
    const code="P"+Date.now().toString().slice(-7)+Math.floor(Math.random()*10);
    if(!(await Product.exists({createdBy,productCode:code})))return code;
  }
  throw new Error("Unable to generate a unique product code.");
}

const PRODUCT_FORM_KEYS=[
  "productName","productCode","description","rate","quantity","serialNumber",
  "designNo","purchaseDate","purchasePrice","barcode","minStock"
];

function cleanCustomFields(value,current={}){
  let parsed=value;
  if(typeof parsed==="string"){
    try{parsed=JSON.parse(parsed||"{}");}
    catch{throw new Error("Custom product fields are not valid.");}
  }
  if(parsed===undefined)return {...current};
  if(parsed instanceof Map||parsed?.$isMongooseMap===true
    ||(typeof parsed?.entries==="function"&&typeof parsed?.get==="function")){
    parsed=Object.fromEntries(parsed.entries());
  }
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)){
    throw new Error("Custom product fields are not valid.");
  }
  const entries=Object.entries(parsed);
  if(entries.length>100)throw new Error("A product can have no more than 100 custom fields.");
  const result={...current};
  for(const [rawKey,fieldValue] of entries){
    const key=String(rawKey).trim();
    if(!key||key.length>100)throw new Error("A custom product field name is not valid.");
    result[key]=fieldValue;
  }
  return result;
}

function plainCustomFields(value){
  if(value instanceof Map||value?.$isMongooseMap===true
    ||(typeof value?.entries==="function"&&typeof value?.get==="function")){
    return Object.fromEntries(value.entries());
  }
  return value&&typeof value==="object"&&!Array.isArray(value)?{...value}:{};
}

function applyConfiguredProductValues(product,values,customFields,fields){
  for(const field of fields||[]){
    if(field?.custom||!field?.key)continue;
    if(Object.prototype.hasOwnProperty.call(values,field.key)){
      product.set(field.key,values[field.key]);
    }
  }
  product.customFields=customFields;
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
      const rx=new RegExp(escapeRegex(search),"i");
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

router.post("/",auth,receiveProductImages,async(req,res)=>{
  let uploadedFilesPersisted=false;
  try{
    const input={};
    PRODUCT_FORM_KEYS.forEach(key=>{
      if(req.body?.[key]!==undefined)input[key]=req.body[key];
    });
    const configuredFields=await loadConfiguredFormFields(owner(req),"products.form");
    const incomingCustomFields=cleanCustomFields(req.body?.customFields);
    const requestedCodeField=configuredFields.find(field=>field.key==="productCode");
    const requestedCodeState=requestedCodeField
      ?getConfiguredFieldState(requestedCodeField,{...input,...incomingCustomFields})
      :{visible:true,readOnly:false,disabled:false};
    // Product codes are generated by the server whenever the field is hidden
    // or locked. A browser cannot choose a value for an automatic identifier.
    const requestedCode=requestedCodeState.visible&&!requestedCodeState.readOnly&&!requestedCodeState.disabled
      ?String(input.productCode||"").trim().toUpperCase()
      :"";
    const generatedCode=requestedCode||await nextProductCode(owner(req));
    input.productCode=generatedCode;

    const prepared=await prepareConfiguredFormValues({
      ownerId:owner(req),
      fields:configuredFields,
      values:input,
      customFields:incomingCustomFields,
      existingValues:{productCode:generatedCode},
      isNewRecord:true
    });
    const values={...prepared.values};
    const code=String(values.productCode||generatedCode).trim().toUpperCase()||generatedCode;
    values.productCode=code;

    if(await Product.exists({createdBy:owner(req),productCode:code})){
      return res.status(409).json({message:"Product code already exists."});
    }
    const barcode=String(values.barcode||code).trim()||code;
    if(await Product.exists({createdBy:owner(req),barcode})){
      return res.status(409).json({message:"Barcode already belongs to another product in this business."});
    }
    const serialNumber=String(values.serialNumber||"").trim();
    if(serialNumber&&await Product.exists({createdBy:owner(req),serialNumber})){
      return res.status(409).json({message:"Serial number already belongs to another product in this business."});
    }

    const product=new Product({
      productName:String(values.productName||"").trim(),
      productCode:code,
      description:String(values.description||"").trim(),
      rate:Number(values.rate||0),
      quantity:Number(values.quantity||0),
      serialNumber:serialNumber||undefined,
      designNo:String(values.designNo||"").trim(),
      purchaseDate:values.purchaseDate||null,
      purchasePrice:Number(values.purchasePrice||0),
      barcode,
      minStock:Number(values.minStock||0),
      createdBy:owner(req),
      images:(req.files||[]).map(file=>publicUrl(req,"/uploads/products/"+file.filename)),
      customFields:prepared.customFields
    });
    if(!product.productName)return res.status(400).json({message:"Product name is required."});
    if(!Number.isFinite(product.rate)||!Number.isFinite(product.quantity)
      ||!Number.isFinite(product.purchasePrice)||!Number.isFinite(product.minStock)
      ||product.rate<0||product.quantity<0||product.purchasePrice<0||product.minStock<0){
      return res.status(400).json({message:"Stock and pricing values must be valid non-negative numbers."});
    }

    await applyWorkflows({resource:"products",event:"record_created",doc:product,createdBy:owner(req)});
    if(hasConfiguredCustomCalculations(configuredFields)){
      product.customFields=calculateConfiguredCustomFields(
        configuredFields,
        product.toObject({depopulate:true}),
        plainCustomFields(product.customFields)
      );
    }
    const validated=validateConfiguredFormValues({
      fields:configuredFields,
      values:product.toObject({depopulate:true}),
      customFields:plainCustomFields(product.customFields),
      validateAllValues:true
    });
    applyConfiguredProductValues(product,validated.values,validated.customFields,configuredFields);

    if(!String(product.productName||"").trim()){
      return res.status(400).json({message:"Product name is required."});
    }
    if(![product.rate,product.quantity,product.purchasePrice,product.minStock].every(value=>
      Number.isFinite(Number(value))&&Number(value)>=0
    )){
      return res.status(400).json({message:"Stock and pricing values must be valid non-negative numbers."});
    }

    await product.save();
    uploadedFilesPersisted=true;
    res.status(201).json({message:"Product created successfully.",product});
  }catch(error){
    const writeError=normalizeProductWriteError(error);
    res.status(writeError.status||400).json({message:writeError.message});
  }finally{
    if(!uploadedFilesPersisted)await discardUploadedFiles(req.files);
  }
});

router.put("/:id",auth,receiveProductImages,async(req,res)=>{
  let uploadedFilesPersisted=false;
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid product ID."});
    const product=await Product.findOne({_id:req.params.id,createdBy:owner(req)});
    if(!product)return res.status(404).json({message:"Product not found."});

    const originalValues=product.toObject({depopulate:true});
    const originalCustomFields=plainCustomFields(product.customFields);
    const values={...originalValues};
    PRODUCT_FORM_KEYS.forEach(key=>{
      if(req.body?.[key]!==undefined)values[key]=req.body[key];
    });
    for(const key of ["productName","description","designNo","productCode","barcode","serialNumber"]){
      if(values[key]!==undefined&&values[key]!==null){
        values[key]=String(values[key]).trim();
      }
    }
    if(values.productCode)values.productCode=String(values.productCode).toUpperCase();
    for(const key of ["rate","quantity","purchasePrice","minStock"]){
      if(req.body?.[key]!==undefined)values[key]=Number(req.body[key]);
    }
    if(req.body?.purchaseDate!==undefined)values.purchaseDate=req.body.purchaseDate||null;

    const nextCustomFields=cleanCustomFields(req.body?.customFields,originalCustomFields);
    const configuredFields=await loadConfiguredFormFields(owner(req),"products.form");
    const prepared=await prepareConfiguredFormValues({
      ownerId:owner(req),
      fields:configuredFields,
      values,
      customFields:nextCustomFields,
      existingValues:originalValues,
      existingCustomFields:originalCustomFields,
      onlyChangedLookups:true
    });

    PRODUCT_FORM_KEYS.forEach(key=>{
      if(Object.prototype.hasOwnProperty.call(prepared.values,key)){
        values[key]=prepared.values[key];
      }
    });
    values.productCode=String(values.productCode||"").trim().toUpperCase();
    values.barcode=String(values.barcode??"").trim();
    if(req.body?.barcode!==undefined&&!values.barcode)values.barcode=values.productCode;
    values.serialNumber=String(values.serialNumber||"").trim();
    values.designNo=String(values.designNo||"").trim();
    values.productName=String(values.productName||"").trim();
    values.description=String(values.description||"").trim();

    if(!values.productCode)return res.status(400).json({message:"Product code is required."});
    if(values.productCode!==String(product.productCode||"")
      &&await Product.exists({createdBy:owner(req),productCode:values.productCode,_id:{$ne:product._id}})){
      return res.status(409).json({message:"Product code already exists."});
    }
    if(values.barcode!==String(product.barcode||"").trim()
      &&await Product.exists({createdBy:owner(req),barcode:values.barcode,_id:{$ne:product._id}})){
      return res.status(409).json({message:"Barcode already belongs to another product in this business."});
    }
    if(values.serialNumber&&values.serialNumber!==String(product.serialNumber||"")
      &&await Product.exists({createdBy:owner(req),serialNumber:values.serialNumber,_id:{$ne:product._id}})){
      return res.status(409).json({message:"Serial number already belongs to another product in this business."});
    }

    PRODUCT_FORM_KEYS.forEach(key=>{
      if(Object.prototype.hasOwnProperty.call(values,key))product.set(key,values[key]);
    });
    if(!values.serialNumber)product.serialNumber=undefined;
    if((req.files||[]).length){
      product.images=[...(product.images||[]),...(req.files||[]).map(file=>publicUrl(req,"/uploads/products/"+file.filename))];
    }
    product.customFields=prepared.customFields;

    if(!Number.isFinite(Number(product.rate))||!Number.isFinite(Number(product.quantity))
      ||!Number.isFinite(Number(product.purchasePrice))||!Number.isFinite(Number(product.minStock))
      ||Number(product.rate)<0||Number(product.quantity)<0
      ||Number(product.purchasePrice)<0||Number(product.minStock)<0){
      return res.status(400).json({message:"Stock and pricing values must be valid non-negative numbers."});
    }

    await applyWorkflows({resource:"products",event:"record_updated",doc:product,createdBy:owner(req)});
    if(hasConfiguredCustomCalculations(configuredFields)){
      product.customFields=calculateConfiguredCustomFields(
        configuredFields,
        product.toObject({depopulate:true}),
        plainCustomFields(product.customFields)
      );
    }
    const validated=validateConfiguredFormValues({
      fields:configuredFields,
      values:product.toObject({depopulate:true}),
      customFields:plainCustomFields(product.customFields),
      existingValues:originalValues,
      existingCustomFields:originalCustomFields
    });
    applyConfiguredProductValues(product,validated.values,validated.customFields,configuredFields);

    if(!String(product.productName||"").trim()){
      return res.status(400).json({message:"Product name is required."});
    }
    if(![product.rate,product.quantity,product.purchasePrice,product.minStock].every(value=>
      Number.isFinite(Number(value))&&Number(value)>=0
    )){
      return res.status(400).json({message:"Stock and pricing values must be valid non-negative numbers."});
    }

    await product.save();
    uploadedFilesPersisted=true;
    res.json({message:"Product updated successfully.",product});
  }catch(error){
    const writeError=normalizeProductWriteError(error);
    res.status(writeError.status||400).json({message:writeError.message});
  }finally{
    if(!uploadedFilesPersisted)await discardUploadedFiles(req.files);
  }
});

router.patch("/:id/stock",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid product ID."});
    const delta=Number(req.body.quantity);
    if(!Number.isFinite(delta)||delta===0)return res.status(400).json({message:"Enter a non-zero stock adjustment."});

    // Apply stock changes atomically. Reading the quantity and saving a new
    // total separately lets simultaneous adjustments overwrite one another.
    const filter={_id:req.params.id,createdBy:owner(req)};
    if(delta<0)filter.quantity={$gte:Math.abs(delta)};
    const product=await Product.findOneAndUpdate(
      filter,
      {$inc:{quantity:delta}},
      {new:true,runValidators:true}
    );

    if(!product){
      const exists=await Product.exists({_id:req.params.id,createdBy:owner(req)});
      if(!exists)return res.status(404).json({message:"Product not found."});
      return res.status(400).json({message:"Insufficient stock."});
    }

    res.json({message:"Stock updated successfully.",product});
  }catch(error){res.status(400).json({message:error.message});}
});

router.delete("/:id",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid product ID."});
    const product=await Product.findOne({_id:req.params.id,createdBy:owner(req)});
    if(!product)return res.status(404).json({message:"Product not found."});

    // Keep catalogue records that form part of invoice history or a posted
    // stock-affecting Credit Note. Removing such a product can make future
    // returns impossible to post or reverse safely.
    const [invoiceReference,creditNoteReference]=await Promise.all([
      Order.exists({createdBy:owner(req),"subOrders.productId":product._id}),
      CreditNote.exists({
        createdBy:owner(req),
        $or:[
          {"items.productId":product._id},
          {"inventoryMovements.productId":product._id}
        ]
      })
    ]);
    if(invoiceReference||creditNoteReference){
      return res.status(409).json({
        message:"This product is linked to invoice history or a posted stock Credit Note, so it cannot be deleted. Set its stock to zero and keep the record for history."
      });
    }

    await Product.deleteOne({_id:product._id,createdBy:owner(req)});
    return res.json({message:"Product deleted successfully."});
  }catch(error){res.status(500).json({message:error.message});}
});

module.exports=router;