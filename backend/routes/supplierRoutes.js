const express=require("express");
const mongoose=require("mongoose");
const Supplier=require("../models/Supplier");
const Purchase=require("../models/Purchase");
const auth=require("../middleware/auth");
const {escapeRegex}=require("../utils/escapeRegex");

const router=express.Router();
const owner=req=>req.user.id;
const clean=(value,max=100)=>String(value??"").trim().slice(0,max);
const normalizeGstin=value=>clean(value,15).toUpperCase();

function validateSupplier(input={}){
 const name=clean(input.name,160);
 const gstin=normalizeGstin(input.gstin);
 if(!name)throw Object.assign(new Error("Enter a supplier name."),{status:400});
 if(gstin&&!/^[0-9A-Z]{15}$/.test(gstin)){
  throw Object.assign(new Error("Enter a valid 15-character GSTIN, or leave it blank."),{status:400});
 }
 const terms=String(input.paymentTerms??"30");
 if(!["0","15","30","45","60","90"].includes(terms)){
  throw Object.assign(new Error("Choose valid supplier payment terms."),{status:400});
 }
 const status=String(input.status||"Active");
 if(!["Active","Inactive"].includes(status)){
  throw Object.assign(new Error("Choose a valid supplier status."),{status:400});
 }
 return {
  name,
  legalName:clean(input.legalName,180),
  gstin,
  contact:{
   person:clean(input.contact?.person,120),
   email:clean(input.contact?.email,160).toLowerCase(),
   phone:clean(input.contact?.phone,30)
  },
  address:clean(input.address,1000),
  city:clean(input.city,100),
  state:clean(input.state,100),
  pinCode:clean(input.pinCode,12),
  paymentTerms:terms,
  notes:clean(input.notes,4000),
  status
 };
}

function normalizeWriteError(error){
 if(error?.code===11000){
  return Object.assign(new Error("A supplier with this GSTIN is already registered in your business."),{status:409});
 }
 return error;
}

router.get("/",auth,async(req,res)=>{
 try{
  const page=Math.max(1,Number.parseInt(req.query.page,10)||1);
  const limit=Math.min(100,Math.max(1,Number.parseInt(req.query.limit,10)||50));
  const query={createdBy:owner(req)};
  if(["Active","Inactive"].includes(String(req.query.status||"")))query.status=req.query.status;
  const search=clean(req.query.search,100);
  if(search){
   const regex=new RegExp(escapeRegex(search),"i");
   query.$or=[{name:regex},{legalName:regex},{gstin:regex},{"contact.person":regex},{"contact.phone":regex}];
  }
  const [rows,total]=await Promise.all([
   Supplier.find(query).sort({name:1,_id:1}).skip((page-1)*limit).limit(limit).lean(),
   Supplier.countDocuments(query)
  ]);
  const ids=rows.map(item=>item._id);
  const summary=ids.length?await Purchase.aggregate([
   {$match:{createdBy:new mongoose.Types.ObjectId(owner(req)),supplierId:{$in:ids},status:"Received"}},
   {$group:{_id:"$supplierId",purchaseCount:{$sum:1},totalPurchased:{$sum:"$grandTotal"},totalPaid:{$sum:"$paidAmount"},outstanding:{$sum:"$dueAmount"}}}
  ]):[];
  const bySupplier=new Map(summary.map(item=>[String(item._id),item]));
  return res.json({
   suppliers:rows.map(item=>({...item,summary:bySupplier.get(String(item._id))||{purchaseCount:0,totalPurchased:0,totalPaid:0,outstanding:0}})),
   pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))}
  });
 }catch(error){return res.status(500).json({message:"Unable to load suppliers."});}
});

router.get("/:id",auth,async(req,res)=>{
 try{
  if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid supplier ID."});
  const supplier=await Supplier.findOne({_id:req.params.id,createdBy:owner(req)}).lean();
  if(!supplier)return res.status(404).json({message:"Supplier not found."});
  const [summary,recentPurchases]=await Promise.all([
   Purchase.aggregate([
    {$match:{supplierId:supplier._id,createdBy:new mongoose.Types.ObjectId(owner(req)),status:"Received"}},
    {$group:{_id:null,purchaseCount:{$sum:1},totalPurchased:{$sum:"$grandTotal"},totalPaid:{$sum:"$paidAmount"},outstanding:{$sum:"$dueAmount"}}}
   ]),
   Purchase.find({supplierId:supplier._id,createdBy:owner(req)}).sort({purchaseDate:-1,createdAt:-1}).limit(10)
    .select("purchaseNumber supplierInvoiceNumber purchaseDate status grandTotal paidAmount dueAmount")
    .lean()
  ]);
  return res.json({supplier,summary:summary[0]||{purchaseCount:0,totalPurchased:0,totalPaid:0,outstanding:0},recentPurchases});
 }catch(error){return res.status(500).json({message:"Unable to load supplier details."});}
});

router.post("/",auth,async(req,res)=>{
 try{
  const values=validateSupplier(req.body);
  const supplier=await Supplier.create({...values,createdBy:owner(req)});
  return res.status(201).json({message:"Supplier added successfully.",supplier});
 }catch(error){
  const normalized=normalizeWriteError(error);
  return res.status(normalized.status||400).json({message:normalized.message||"Unable to add supplier."});
 }
});

router.put("/:id",auth,async(req,res)=>{
 try{
  if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid supplier ID."});
  const supplier=await Supplier.findOne({_id:req.params.id,createdBy:owner(req)});
  if(!supplier)return res.status(404).json({message:"Supplier not found."});
  const current=supplier.toObject({depopulate:true});
  Object.assign(supplier,validateSupplier({...current,...req.body,contact:{...(current.contact||{}),...(req.body?.contact||{})}}));
  await supplier.save();
  return res.json({message:"Supplier updated successfully.",supplier});
 }catch(error){
  const normalized=normalizeWriteError(error);
  return res.status(normalized.status||400).json({message:normalized.message||"Unable to update supplier."});
 }
});

router.delete("/:id",auth,async(req,res)=>{
 try{
  if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid supplier ID."});
  const supplier=await Supplier.findOne({_id:req.params.id,createdBy:owner(req)});
  if(!supplier)return res.status(404).json({message:"Supplier not found."});
  const hasPurchases=await Purchase.exists({supplierId:supplier._id,createdBy:owner(req)});
  if(hasPurchases){
   supplier.status="Inactive";
   await supplier.save();
   return res.json({message:"Supplier has purchase history, so it was marked inactive instead of deleted.",supplier});
  }
  await Supplier.deleteOne({_id:supplier._id,createdBy:owner(req)});
  return res.json({message:"Supplier deleted successfully."});
 }catch(error){return res.status(400).json({message:error.message||"Unable to remove supplier."});}
});

module.exports=router;
