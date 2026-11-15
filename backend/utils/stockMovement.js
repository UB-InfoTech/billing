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
 const current=await Product.findOne(filter).session(session||null);
 if(!current)throw stockError("A selected product is no longer available in this business.",404);
 if(current.trackInventory&&current.stockUnit!==unit){
  throw stockError((current.productName||"This product")+" is tracked in "+current.stockUnit+". Use the same unit on this record.");
 }
 if(delta<0&&Number(current.quantity||0)+delta < -0.0000001){
  throw stockError("Not enough stock for "+(current.productName||"this product")+". Available: "+Number(current.quantity||0)+" "+(current.stockUnit||unit)+".",409);
 }

 const before=Number(current.quantity||0);
 const update={$inc:{quantity:delta}};
 if(activateTracking&&!current.trackInventory){
  update.$set={trackInventory:true,stockUnit:unit};
 }
 const updated=await Product.findOneAndUpdate(filter,update,{new:true,runValidators:true,session:session||undefined});
 if(!updated)throw stockError("The product changed while stock was being updated. Refresh and try again.",409);

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
   await Product.updateOne({_id:updated._id,createdBy},{$inc:{quantity:-delta}});
   if(activateTracking&&!current.trackInventory){
    await Product.updateOne({_id:updated._id,createdBy},{$set:{trackInventory:false,stockUnit:current.stockUnit||"PCS"}});
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

module.exports={stockError,movementQuantity,recordStockMovement,undoStockMovement,rollbackStockMovements};
