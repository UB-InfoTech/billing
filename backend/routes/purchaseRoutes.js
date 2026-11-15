const express=require("express");
const mongoose=require("mongoose");
const Supplier=require("../models/Supplier");
const Product=require("../models/Product");
const Purchase=require("../models/Purchase");
const StockMovement=require("../models/StockMovement");
const auth=require("../middleware/auth");
const {
 recordStockMovement,
 rollbackStockMovements,
 stockError
}=require("../utils/stockMovement");

const router=express.Router();
const owner=req=>req.user.id;
const round2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
const METHODS=["Cash","Bank Transfer","UPI","Cheque","Bank"];
const paymentStatus=purchase=>Number(purchase.dueAmount||0)<=0?"Paid":Number(purchase.paidAmount||0)>0?"Partial":"Unpaid";

function purchaseNumber(){
 const date=new Date();
 const year=date.getFullYear().toString().slice(-2);
 const month=String(date.getMonth()+1).padStart(2,"0");
 const random=Math.random().toString(36).slice(2,7).toUpperCase();
 return "PUR-"+year+month+"-"+Date.now().toString().slice(-6)+"-"+random;
}

function validateItems(rawItems,productsById){
 if(!Array.isArray(rawItems)||rawItems.length===0)throw stockError("Add at least one product to this purchase.");
 if(rawItems.length>200)throw stockError("A purchase can contain up to 200 product lines.");
 const seenUnits=new Map();
 let subtotal=0,discountAmount=0,taxAmount=0;
 const items=rawItems.map((raw,index)=>{
  const productId=String(raw?.productId||"").trim();
  if(!mongoose.isValidObjectId(productId))throw stockError("Choose a product for purchase line "+(index+1)+".");
  const product=productsById.get(productId);
  if(!product)throw stockError("One of the selected products is not available in this business.");
  const quantity=Number(raw.quantity);
  const unitCost=Number(raw.unitCost);
  const unit=String(raw.unit||product.stockUnit||"PCS").toUpperCase();
  const discountRate=Number(raw.discountRate||0);
  const taxRate=Number(raw.taxRate||0);
  if(!Number.isFinite(quantity)||quantity<=0)throw stockError("Enter a quantity greater than zero for "+product.productName+".");
  if(!Number.isFinite(unitCost)||unitCost<0)throw stockError("Enter a valid purchase rate for "+product.productName+".");
  if(!["PCS","MTR"].includes(unit))throw stockError("Choose PCS or MTR for "+product.productName+".");
  if(!Number.isFinite(discountRate)||discountRate<0||discountRate>100)throw stockError("Discount must be between 0 and 100 for "+product.productName+".");
  if(!Number.isFinite(taxRate)||taxRate<0||taxRate>100)throw stockError("Tax must be between 0 and 100 for "+product.productName+".");
  if(product.trackInventory&&product.stockUnit!==unit){
   throw stockError(product.productName+" is tracked in "+product.stockUnit+". Change the purchase unit to match the product.");
  }
  const previousUnit=seenUnits.get(productId);
  if(previousUnit&&previousUnit!==unit)throw stockError("Use one stock unit for "+product.productName+" in the same purchase.");
  seenUnits.set(productId,unit);
  const lineSubtotal=round2(quantity*unitCost);
  const lineDiscount=round2(lineSubtotal*discountRate/100);
  const taxable=round2(lineSubtotal-lineDiscount);
  const lineTax=round2(taxable*taxRate/100);
  const total=round2(taxable+lineTax);
  subtotal=round2(subtotal+lineSubtotal);
  discountAmount=round2(discountAmount+lineDiscount);
  taxAmount=round2(taxAmount+lineTax);
  return {
   productId:product._id,productName:product.productName,productCode:product.productCode||"",
   quantity,unit,unitCost,discountRate,taxRate,subtotal:lineSubtotal,
   discountAmount:lineDiscount,taxableAmount:taxable,taxAmount:lineTax,totalAmount:total
  };
 });
 return {items,subtotal,discountAmount,taxAmount,grandTotal:round2(subtotal-discountAmount+taxAmount)};
}

function normalizePayment(input,total){
 const amount=round2(input?.amount);
 const method=String(input?.method||"Bank Transfer");
 const paidAt=new Date(input?.paidAt||new Date());
 const reference=String(input?.reference||"").trim().slice(0,120);
 if(!Number.isFinite(amount)||amount<0)throw stockError("Enter a valid initial payment.");
 if(amount>total+0.009)throw stockError("Initial payment cannot exceed the purchase total.");
 if(amount>0&&!METHODS.includes(method))throw stockError("Choose a valid payment method.");
 if(Number.isNaN(paidAt.getTime()))throw stockError("Enter a valid payment date.");
 return {amount,method,paidAt,reference,note:String(input?.note||"").trim().slice(0,300)};
}

router.get("/",auth,async(req,res)=>{
 try{
  const query={createdBy:owner(req)};
  if(req.query.supplierId){
   if(!mongoose.isValidObjectId(req.query.supplierId))return res.status(400).json({message:"Choose a valid supplier."});
   query.supplierId=req.query.supplierId;
  }
  if(["Received","Cancelled"].includes(String(req.query.status||"")))query.status=req.query.status;
  const page=Math.max(1,Number.parseInt(req.query.page,10)||1);
  const limit=Math.min(100,Math.max(1,Number.parseInt(req.query.limit,10)||25));
  const search=String(req.query.search||"").trim().slice(0,100);
  if(search){
   const regex=new RegExp(require("../utils/escapeRegex").escapeRegex(search),"i");
   query.$or=[{purchaseNumber:regex},{supplierInvoiceNumber:regex},{supplierName:regex}];
  }
  if(req.query.from||req.query.to){
   query.purchaseDate={};
   if(req.query.from){const from=new Date(req.query.from);if(!Number.isNaN(from.getTime())){from.setHours(0,0,0,0);query.purchaseDate.$gte=from;}}
   if(req.query.to){const to=new Date(req.query.to);if(!Number.isNaN(to.getTime())){to.setHours(23,59,59,999);query.purchaseDate.$lte=to;}}
  }
  const [purchases,total,summary]=await Promise.all([
   Purchase.find(query).sort({purchaseDate:-1,createdAt:-1}).skip((page-1)*limit).limit(limit)
    .populate({path:"supplierId",select:"name gstin contact",match:{createdBy:owner(req)}}).lean(),
   Purchase.countDocuments(query),
   Purchase.aggregate([
    {$match:{createdBy:new mongoose.Types.ObjectId(owner(req)),status:"Received"}},
    {$group:{_id:null,purchaseCount:{$sum:1},totalPurchased:{$sum:"$grandTotal"},totalPaid:{$sum:"$paidAmount"},outstanding:{$sum:"$dueAmount"}}}
   ])
  ]);
  return res.json({
   purchases:purchases.map(item=>({...item,paymentStatus:paymentStatus(item)})),
   pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))},
   summary:summary[0]||{purchaseCount:0,totalPurchased:0,totalPaid:0,outstanding:0}
  });
 }catch(error){return res.status(500).json({message:"Unable to load purchases."});}
});

router.get("/:id",auth,async(req,res)=>{
 try{
  if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid purchase ID."});
  const purchase=await Purchase.findOne({_id:req.params.id,createdBy:owner(req)})
   .populate({path:"supplierId",select:"name gstin contact address city state pinCode",match:{createdBy:owner(req)}})
   .populate({path:"items.productId",select:"productName productCode stockUnit quantity",match:{createdBy:owner(req)}})
   .lean();
  if(!purchase)return res.status(404).json({message:"Purchase not found."});
  const movements=await StockMovement.find({createdBy:owner(req),sourceType:"purchase",sourceId:purchase._id})
   .sort({createdAt:1}).lean();
  return res.json({purchase:{...purchase,paymentStatus:paymentStatus(purchase)},movements});
 }catch(error){return res.status(500).json({message:"Unable to load this purchase."});}
});

router.post("/",auth,async(req,res)=>{
 const applied=[];
 let purchase=null;
 try{
  const supplierId=String(req.body?.supplierId||"");
  if(!mongoose.isValidObjectId(supplierId))throw stockError("Choose a supplier before receiving this purchase.");
  const supplier=await Supplier.findOne({_id:supplierId,createdBy:owner(req),status:"Active"}).lean();
  if(!supplier)throw stockError("The selected supplier is inactive or not available in this business.",404);
  const ids=[...new Set((Array.isArray(req.body?.items)?req.body.items:[]).map(item=>String(item?.productId||"").trim()).filter(Boolean))];
  if(ids.some(id=>!mongoose.isValidObjectId(id)))throw stockError("A purchase contains an invalid product.");
  const products=await Product.find({_id:{$in:ids},createdBy:owner(req)}).lean();
  const productsById=new Map(products.map(product=>[String(product._id),product]));
  const calculated=validateItems(req.body?.items,productsById);
  const purchaseDate=new Date(req.body?.purchaseDate||new Date());
  if(Number.isNaN(purchaseDate.getTime()))throw stockError("Enter a valid purchase date.");
  const dueDate=req.body?.dueDate?new Date(req.body.dueDate):null;
  if(req.body?.dueDate&&Number.isNaN(dueDate.getTime()))throw stockError("Enter a valid due date.");
  const supplierInvoiceNumber=String(req.body?.supplierInvoiceNumber||"").trim().slice(0,80);
  const initialPayment=normalizePayment(req.body?.initialPayment,calculated.grandTotal);
  const payments=initialPayment.amount>0?[initialPayment]:[];
  purchase=new Purchase({
   purchaseNumber:purchaseNumber(),
   supplierId:supplier._id,
   supplierName:supplier.name,
   supplierGstin:supplier.gstin||"",
   supplierInvoiceNumber,
   purchaseDate,dueDate,
   status:"Received",receivedAt:new Date(),
   items:calculated.items,
   subtotal:calculated.subtotal,
   discountAmount:calculated.discountAmount,
   taxAmount:calculated.taxAmount,
   grandTotal:calculated.grandTotal,
   payments,
   paidAmount:initialPayment.amount,
   dueAmount:round2(calculated.grandTotal-initialPayment.amount),
   notes:String(req.body?.notes||"").trim().slice(0,4000),
   createdBy:owner(req)
  });
  for(const item of calculated.items){
   const result=await recordStockMovement({
    createdBy:owner(req),productId:item.productId,quantityChange:item.quantity,unit:item.unit,
    sourceType:"purchase",sourceId:purchase._id,sourceItemId:item._id,
    movementType:"purchase_received",reference:supplierInvoiceNumber||purchase.purchaseNumber,
    note:"Stock received from "+supplier.name,
    activateTracking:true
   });
   applied.push(result.movement);
  }
  purchase.stockMovementIds=applied.map(item=>item._id);
  await purchase.save();
  const saved=await Purchase.findById(purchase._id)
   .populate({path:"supplierId",select:"name gstin contact",match:{createdBy:owner(req)}}).lean();
  return res.status(201).json({message:"Purchase received and stock updated successfully.",purchase:{...saved,paymentStatus:paymentStatus(saved)}});
 }catch(error){
  if(applied.length){
   try{await rollbackStockMovements(applied,owner(req));}
   catch(rollbackError){console.error("Purchase stock rollback failed:",rollbackError);}
  }
  if(purchase?._id){
   try{await Purchase.deleteOne({_id:purchase._id,createdBy:owner(req)});}catch(deleteError){console.error("Failed to remove incomplete purchase:",deleteError);}
  }
  const status=error.status||(error.code===11000?409:400);
  return res.status(status).json({message:error.code===11000?"This supplier invoice number has already been recorded.":error.message||"Unable to receive this purchase."});
 }
});

router.post("/:id/payments",auth,async(req,res)=>{
 try{
  if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid purchase ID."});
  const amount=round2(req.body?.amount);
  const method=String(req.body?.method||"Bank Transfer");
  const paidAt=new Date(req.body?.paidAt||new Date());
  const reference=String(req.body?.reference||"").trim().slice(0,120);
  const note=String(req.body?.note||"").trim().slice(0,300);
  if(!Number.isFinite(amount)||amount<=0)return res.status(400).json({message:"Payment must be greater than zero."});
  if(!METHODS.includes(method))return res.status(400).json({message:"Choose a valid payment method."});
  if(Number.isNaN(paidAt.getTime()))return res.status(400).json({message:"Enter a valid payment date."});
  const payment={_id:new mongoose.Types.ObjectId(),amount,method,paidAt,reference,note};
  const purchase=await Purchase.findOneAndUpdate({
   _id:req.params.id,createdBy:owner(req),status:"Received",dueAmount:{$gte:amount}
  },{
   $inc:{paidAmount:amount,dueAmount:-amount},
   $push:{payments:payment}
  },{new:true,runValidators:true})
   .populate({path:"supplierId",select:"name gstin contact",match:{createdBy:owner(req)}}).lean();
  if(!purchase){
   const exists=await Purchase.exists({_id:req.params.id,createdBy:owner(req),status:"Received"});
   if(!exists)return res.status(404).json({message:"Received purchase not found."});
   const current=await Purchase.findOne({_id:req.params.id,createdBy:owner(req)}).select("dueAmount").lean();
   return res.status(409).json({message:"Payment exceeds the remaining supplier balance of ₹"+Number(current?.dueAmount||0).toFixed(2)+"."});
  }
  return res.json({message:"Supplier payment recorded.",purchase:{...purchase,paymentStatus:paymentStatus(purchase)}});
 }catch(error){return res.status(400).json({message:error.message||"Unable to record supplier payment."});}
});

router.post("/:id/cancel",auth,async(req,res)=>{
 const reversals=[];
 try{
  if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid purchase ID."});
  const purchase=await Purchase.findOne({_id:req.params.id,createdBy:owner(req)});
  if(!purchase)return res.status(404).json({message:"Purchase not found."});
  if(purchase.status==="Cancelled")return res.json({message:"This purchase is already cancelled.",purchase});
  if(Number(purchase.paidAmount||0)>0||(purchase.payments||[]).length>0){
   return res.status(409).json({message:"This purchase has supplier payments recorded. Record and reconcile a supplier refund before cancelling it; payment history will not be erased."});
  }
  const stockMovements=await StockMovement.find({createdBy:owner(req),sourceType:"purchase",sourceId:purchase._id,movementType:"purchase_received"}).lean();
  const netByItem=new Map();
  stockMovements.forEach(item=>{
   const key=String(item.productId)+"|"+String(item.unit);
   netByItem.set(key,(netByItem.get(key)||0)+Number(item.quantityChange||0));
  });
  for(const [key,quantity] of netByItem){
   if(quantity<=0)continue;
   const [productId,unit]=key.split("|");
   const result=await recordStockMovement({
    createdBy:owner(req),productId,quantityChange:-quantity,unit,
    sourceType:"purchase",sourceId:purchase._id,
    movementType:"purchase_cancelled",reference:purchase.supplierInvoiceNumber||purchase.purchaseNumber,
    note:"Stock reversed because purchase was cancelled"
   });
   reversals.push(result.movement);
  }
  purchase.status="Cancelled";
  purchase.cancelledAt=new Date();
  await purchase.save();
  return res.json({message:"Purchase cancelled and remaining stock reversed.",purchase});
 }catch(error){
  if(reversals.length){
   try{await rollbackStockMovements(reversals,owner(req));}
   catch(rollbackError){console.error("Purchase cancellation stock rollback failed:",rollbackError);}
  }
  return res.status(error.status||400).json({message:error.message||"Unable to cancel this purchase."});
 }
});

module.exports=router;
