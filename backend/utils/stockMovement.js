const mongoose=require("mongoose");
const Product=require("../models/Product");
const StockMovement=require("../models/StockMovement");

function stockError(message,status=400){
 const error=new Error(message);
 error.status=status;
 return error;
}

function movementQuantity(item={}){
 const unit=item.unit||item.qtyUnit||"PCS";
 const entered=unit==="MTR"?Number(item.MTR??item.quantity??0):Number(item.quantity||0);
 const short=Math.max(0,Number(item.shortPcs||0));
 return {
  unit,
  quantity:Math.max(0,Math.round((entered-short+Number.EPSILON)*10000)/10000)
 };
}

async function recordStockMovement({
 createdBy,productId,quantityChange,unit,sourceType,sourceId=null,sourceItemId=null,
 movementType,reference="",note="",activateTracking=false,session=null
}){
 const delta=Number(quantityChange);
 if(!mongoose.isValidObjectId(productId))throw stockError("A valid product is required for this stock movement.");
 if(!Number.isFinite(delta)||Math.abs(delta)<0.0000001)throw stockError("Stock movement quantity must be greater than zero.");
 if(!["PCS","MTR"].includes(unit))throw stockError("Choose a valid stock unit.");

 const filter={_id:productId,createdBy};
 const currentQuery=Product.findOne(filter);
 if(session)currentQuery.session(session);
 const current=await currentQuery;
 if(!current)throw stockError("A selected product is no longer available in this business.",404);
 if(current.trackInventory&&current.stockUnit!==unit){
  throw stockError((current.productName||"This product")+" is tracked in "+current.stockUnit+". Use the same unit on this record.");
 }

 const update={$inc:{quantity:delta}};
 if(activateTracking&&!current.trackInventory){
  update.$set={trackInventory:true,stockUnit:unit,trackInventoryStartedAt:new Date()};
 }
 const atomicFilter={...filter};
 if(delta<0)atomicFilter.quantity={$gte:Math.abs(delta)};
 const updated=await Product.findOneAndUpdate(
  atomicFilter,update,{new:true,runValidators:true,session:session||undefined}
 );
 if(!updated){
  const exists=await Product.exists(filter);
  if(!exists)throw stockError("The selected product is no longer available in this business.",404);
  throw stockError("Not enough stock, or stock changed while it was being updated. Refresh and try again.",409);
 }

 const before=Number(updated.quantity||0)-delta;
 const movement=new StockMovement({
  productId:updated._id,
  productName:updated.productName||"",
  productCode:updated.productCode||"",
  movementType,sourceType,sourceId,sourceItemId,
  reference:String(reference||"").slice(0,120),
  unit,
  quantityChange:delta,
  quantityBefore:before,
  quantityAfter:Number(updated.quantity||0),
  note:String(note||"").slice(0,500),
  createdBy
 });
 try{
  await movement.save({session:session||undefined});
 }catch(error){
  if(!session){
   const rollback=await Product.updateOne(
    {_id:updated._id,createdBy,quantity:updated.quantity},
    {$inc:{quantity:-delta}}
   );
   if(rollback.matchedCount===1&&activateTracking&&!current.trackInventory){
    await Product.updateOne(
     {_id:updated._id,createdBy,trackInventoryStartedAt:update.$set.trackInventoryStartedAt},
     {$set:{trackInventory:false,stockUnit:current.stockUnit||"PCS"},$unset:{trackInventoryStartedAt:1}}
    );
   }
  }
  throw error;
 }
 return {movement,product:updated};
}

async function undoStockMovement(movement,createdBy){
 if(!movement)return;
 const delta=Number(movement.quantityChange||0);
 const filter={_id:movement.productId,createdBy};
 if(delta>0)filter.quantity={$gte:delta};
 const result=await Product.updateOne(filter,{$inc:{quantity:-delta}});
 if(result.matchedCount!==1){
  throw stockError("Stock changed before the operation could be rolled back. Check the product stock history.",409);
 }
 await StockMovement.deleteOne({_id:movement._id,createdBy});
}

async function rollbackStockMovements(movements,createdBy){
 const failures=[];
 for(const entry of [...(movements||[])].reverse()){
  try{await undoStockMovement(entry.movement||entry,createdBy);}
  catch(error){failures.push(error.message);}
 }
 if(failures.length)throw stockError("Some stock changes could not be rolled back: "+failures.join("; "),500);
}

async function synchronizeInvoiceStock({createdBy,order,session=null}){
 if(!order?._id)throw stockError("Save the invoice record before recording its stock movement.");
 const orderId=order._id;
 const existingQuery=StockMovement.find({
  createdBy,sourceType:"invoice",sourceId:orderId
 });
 if(session)existingQuery.session(session);
 const existing=await existingQuery.lean();
 const existingNet=new Map();
 const existingMeta=new Map();
 for(const movement of existing){
  const productId=String(movement.productId);
  const itemId=String(movement.sourceItemId||"");
  const key=productId+"|"+itemId;
  existingNet.set(key,(existingNet.get(key)||0)+Number(movement.quantityChange||0));
  existingMeta.set(key,{productId,itemId,unit:movement.unit});
 }

 const currentItems=Array.isArray(order.subOrders)?order.subOrders:[];
 const desired=new Map();
 const productIds=new Set(existing.map(item=>String(item.productId)));
 for(const item of currentItems){
  const productId=String(item.productId?._id||item.productId||"").trim();
  if(productId&&mongoose.isValidObjectId(productId))productIds.add(productId);
 }
 if(!productIds.size)return [];

 const productsQuery=Product.find({_id:{$in:[...productIds]},createdBy})
  .select("_id productName stockUnit trackInventory trackInventoryStartedAt");
 if(session)productsQuery.session(session);
 const products=await productsQuery.lean();
 const productById=new Map(products.map(item=>[String(item._id),item]));

 for(const item of currentItems){
  const productId=String(item.productId?._id||item.productId||"").trim();
  if(!productId)continue;
  const itemId=String(item._id||"");
  if(!itemId)throw stockError("An invoice item is missing its record ID. Refresh the invoice and try again.");
  const key=productId+"|"+itemId;
  const product=productById.get(productId);
  if(!product)throw stockError("A product on this invoice is no longer available in this business.",404);
  const wasRecorded=existingNet.has(key);
  if(!product.trackInventory&&!wasRecorded)continue;
  const createdAt=order.createdAt?new Date(order.createdAt):new Date();
  const trackingStartedAt=product.trackInventoryStartedAt?new Date(product.trackInventoryStartedAt):null;
  // Existing invoices created before a product began being tracked are not
  // retroactively deducted when someone merely edits the invoice later.
  const predatesTracking=trackingStartedAt&&createdAt<trackingStartedAt&&!wasRecorded;
  const amounts=movementQuantity(item);
  if(product.trackInventory&&!predatesTracking&&product.stockUnit!==amounts.unit){
   throw stockError(product.productName+" is tracked in "+product.stockUnit+". Change the invoice item unit to match the product.");
  }
  const sold=predatesTracking?0:amounts.quantity;
  desired.set(key,{
   productId,itemId,
   unit:product.stockUnit||amounts.unit,
   desiredNet:order.status==="Cancelled"?0:-sold,
   productName:product.productName||item.orderName||"product"
  });
 }

 for(const [key,meta] of existingMeta){
  if(!desired.has(key))desired.set(key,{...meta,desiredNet:0,productName:productById.get(meta.productId)?.productName||"product"});
 }

 const applied=[];
 try{
  for(const [key,target] of desired){
   const previous=Number(existingNet.get(key)||0);
   const delta=Math.round((Number(target.desiredNet||0)-previous+Number.EPSILON)*10000)/10000;
   if(Math.abs(delta)<0.0001)continue;
   const result=await recordStockMovement({
    createdBy,productId:target.productId,quantityChange:delta,unit:target.unit,
    sourceType:"invoice",sourceId:orderId,
    sourceItemId:target.itemId||null,
    movementType:delta<0?"invoice_sale":"invoice_cancelled",
    reference:String(order.orderNumber||"Invoice"),
    note:delta<0?"Stock issued for invoice":"Stock returned after invoice change or cancellation",
    session
   });
   applied.push(result.movement);
  }
  return applied;
 }catch(error){
  if(!session&&applied.length){
   try{await rollbackStockMovements(applied,createdBy);}
   catch(rollbackError){error.message+=" Stock rollback also needs attention: "+rollbackError.message;}
  }
  throw error;
 }
}

module.exports={
 stockError,movementQuantity,recordStockMovement,undoStockMovement,
 rollbackStockMovements,synchronizeInvoiceStock
};
