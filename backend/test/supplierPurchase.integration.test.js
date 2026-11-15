const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const mongoose=require("mongoose");
const jwt=require("jsonwebtoken");

process.env.JWT_SECRET ||= "supplier-purchase-integration-tests-only-secret";
const app=require("../server");
const Supplier=require("../models/Supplier");
const Expense=require("../models/Expense");
const Product=require("../models/Product");
const Purchase=require("../models/Purchase");
const StockMovement=require("../models/StockMovement");
const Order=require("../models/Order2");
const {synchronizeInvoiceStock}=require("../utils/stockMovement");

const mongoUri=process.env.MONGO_URI;

test("supplier purchases, payments, invoice stock and movement history stay connected",{
 skip:!mongoUri?"Set MONGO_URI to run supplier purchase integration tests.":false
},async()=>{
 let server,ownerId,otherOwnerId,supplierId,otherSupplierId,expenseSupplierId,productId,purchaseId,paidPurchaseId,orderId;
 try{
  await mongoose.connect(mongoUri,{serverSelectionTimeoutMS:10000});
  await Promise.all([
   Supplier.init(),Expense.init(),Product.init(),Purchase.init(),StockMovement.init(),Order.init()
  ]);
  ownerId=new mongoose.Types.ObjectId();
  otherOwnerId=new mongoose.Types.ObjectId();
  const ownerToken=jwt.sign({user:{id:String(ownerId)}},process.env.JWT_SECRET);
  const otherToken=jwt.sign({user:{id:String(otherOwnerId)}},process.env.JWT_SECRET);
  const suffix=crypto.randomBytes(5).toString("hex");
  const gstin="24ABCDE1234F1Z5";

  server=app.listen(0,"127.0.0.1");
  await new Promise((resolve,reject)=>{server.once("listening",resolve);server.once("error",reject);});
  const base="http://127.0.0.1:"+server.address().port+"/api";
  const request=async(path,{method="GET",body,token=ownerToken}={})=>{
   const response=await fetch(base+path,{
    method,
    headers:{"x-auth-token":token,...(body===undefined?{}:{"content-type":"application/json"})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
   });
   const raw=await response.text();
   let payload;
   try{payload=raw?JSON.parse(raw):null;}catch{payload=raw;}
   return {response,payload};
  };

  const supplierResponse=await request("/suppliers",{
   method:"POST",
   body:{name:"Supplier "+suffix,gstin,contact:{person:"Vendor Contact",phone:"9876543210"},paymentTerms:"30"}
  });
  assert.equal(supplierResponse.response.status,201,JSON.stringify(supplierResponse.payload));
  supplierId=supplierResponse.payload.supplier._id;

  const otherSupplierResponse=await request("/suppliers",{
   method:"POST",token:otherToken,
   body:{name:"Other business supplier "+suffix,gstin}
  });
  assert.equal(otherSupplierResponse.response.status,201,JSON.stringify(otherSupplierResponse.payload));
  otherSupplierId=otherSupplierResponse.payload.supplier._id;

  const product=await Product.create({
   productName:"Purchase test product "+suffix,
   productCode:"PUR"+suffix.toUpperCase(),
   rate:150,
   purchasePrice:100,
   quantity:0,
   stockUnit:"PCS",
   createdBy:ownerId
  });
  productId=product._id;

  const purchaseResponse=await request("/purchases",{
   method:"POST",
   body:{
    supplierId,
    supplierInvoiceNumber:"BILL-"+suffix.toUpperCase(),
    purchaseDate:new Date().toISOString().slice(0,10),
    items:[{productId:String(productId),quantity:10,unit:"PCS",unitCost:100,taxRate:0,discountRate:0}],
    initialPayment:{amount:0,method:"Bank Transfer",reference:""}
   }
  });
  assert.equal(purchaseResponse.response.status,201,JSON.stringify(purchaseResponse.payload));
  purchaseId=purchaseResponse.payload.purchase._id;
  assert.equal(purchaseResponse.payload.purchase.grandTotal,1000);
  assert.equal(purchaseResponse.payload.purchase.paidAmount,0);
  assert.equal(purchaseResponse.payload.purchase.dueAmount,1000);

  let updatedProduct=await Product.findOne({_id:productId,createdBy:ownerId}).lean();
  assert.equal(updatedProduct.quantity,10);
  assert.equal(updatedProduct.trackInventory,true);
  assert.equal(updatedProduct.stockUnit,"PCS");
  assert.ok(updatedProduct.trackInventoryStartedAt);

  const paidPurchaseResponse=await request("/purchases",{
   method:"POST",
   body:{
    supplierId,
    supplierInvoiceNumber:"BILL-PAID-"+suffix.toUpperCase(),
    purchaseDate:new Date().toISOString().slice(0,10),
    items:[{productId:String(productId),quantity:2,unit:"PCS",unitCost:100,taxRate:0,discountRate:0}],
    initialPayment:{amount:100,method:"Bank Transfer",reference:"BANK-PAID-"+suffix}
   }
  });
  assert.equal(paidPurchaseResponse.response.status,201,JSON.stringify(paidPurchaseResponse.payload));
  paidPurchaseId=paidPurchaseResponse.payload.purchase._id;

  const addPayment=await request("/purchases/"+paidPurchaseId+"/payments",{
   method:"POST",body:{amount:50,method:"UPI",reference:"UPI-"+suffix}
  });
  assert.equal(addPayment.response.status,200,JSON.stringify(addPayment.payload));
  assert.equal(addPayment.payload.purchase.paidAmount,150);
  assert.equal(addPayment.payload.purchase.dueAmount,50);

  const purchaseList=await request("/purchases");
  assert.equal(purchaseList.response.status,200);
  assert.equal(purchaseList.payload.summary.purchaseCount,2);
  assert.equal(purchaseList.payload.summary.totalPurchased,1200);
  assert.equal(purchaseList.payload.summary.totalPaid,150);
  assert.equal(purchaseList.payload.summary.outstanding,1050);

  const supplierProfile=await request("/suppliers/"+supplierId);
  assert.equal(supplierProfile.response.status,200);
  assert.equal(supplierProfile.payload.summary.purchaseCount,2);
  assert.equal(supplierProfile.payload.summary.outstanding,1050);

  const duplicateGstinInSameBusiness=await request("/suppliers",{
   method:"POST",body:{name:"Duplicate GST supplier "+suffix,gstin}
  });
  assert.equal(duplicateGstinInSameBusiness.response.status,409);

  const expenseSupplier=await request("/suppliers",{
   method:"POST",body:{name:"Expense-linked supplier "+suffix}
  });
  assert.equal(expenseSupplier.response.status,201,JSON.stringify(expenseSupplier.payload));
  expenseSupplierId=expenseSupplier.payload.supplier._id;
  await Expense.create({
   description:"Supplier-linked business expense",
   amount:25,category:"Purchases",supplierId:expenseSupplierId,createdBy:ownerId
  });
  const safeSupplierDelete=await request("/suppliers/"+expenseSupplierId,{method:"DELETE"});
  assert.equal(safeSupplierDelete.response.status,200);
  assert.equal(safeSupplierDelete.payload.supplier.status,"Inactive");
  assert.match(safeSupplierDelete.payload.message,/expense history/i);

  const createOrder=new Order({
   orderNumber:"SALE-"+suffix.toUpperCase(),
   orderDate:new Date(),
   companyName:"Stock test customer",
   status:"Pending",
   taxPercentage:0,
   discountRate:0,
   subOrders:[{
    productId,
    orderName:product.productName,
    qtyUnit:"PCS",
    quantity:3,
    unitPrice:150
   }],
   createdBy:ownerId
  });
  const invoiceMovements=await synchronizeInvoiceStock({createdBy:ownerId,order:createOrder});
  await createOrder.save();
  orderId=createOrder._id;
  assert.equal(invoiceMovements.length,1);
  assert.equal(invoiceMovements[0].movementType,"invoice_sale");

  updatedProduct=await Product.findOne({_id:productId,createdBy:ownerId}).lean();
  assert.equal(updatedProduct.quantity,9);

  const productUsage=await request("/products/"+productId+"/usage");
  assert.equal(productUsage.response.status,200,JSON.stringify(productUsage.payload));
  assert.equal(productUsage.payload.totalInvoices,1);
  assert.equal(productUsage.payload.invoices[0].invoiceId,String(orderId));
  assert.equal(productUsage.payload.invoices[0].lines[0].quantity,3);

  const blockedCancel=await request("/purchases/"+purchaseId+"/cancel",{method:"POST",body:{}});
  assert.equal(blockedCancel.response.status,409);
  const stillReceived=await Purchase.findOne({_id:purchaseId,createdBy:ownerId}).lean();
  assert.equal(stillReceived.status,"Received");
  updatedProduct=await Product.findOne({_id:productId,createdBy:ownerId}).lean();
  assert.equal(updatedProduct.quantity,7);

  createOrder.status="Cancelled";
  const returnedMovements=await synchronizeInvoiceStock({createdBy:ownerId,order:createOrder});
  await createOrder.save();
  assert.equal(returnedMovements.length,1);
  assert.equal(returnedMovements[0].movementType,"invoice_cancelled");

  updatedProduct=await Product.findOne({_id:productId,createdBy:ownerId}).lean();
  assert.equal(updatedProduct.quantity,12);

  const noSalesAfterCancellation=await request("/products/"+productId+"/usage");
  assert.equal(noSalesAfterCancellation.response.status,200);
  assert.equal(noSalesAfterCancellation.payload.totalInvoices,0);

  const stockHistory=await request("/products/"+productId+"/stock-movements");
  assert.equal(stockHistory.response.status,200);
  assert.ok(stockHistory.payload.movements.some(item=>item.movementType==="purchase_received"));
  assert.ok(stockHistory.payload.movements.some(item=>item.movementType==="invoice_sale"));
  assert.ok(stockHistory.payload.movements.some(item=>item.movementType==="invoice_cancelled"));

  const purchaseCancel=await request("/purchases/"+purchaseId+"/cancel",{method:"POST",body:{}});
  assert.equal(purchaseCancel.response.status,200,JSON.stringify(purchaseCancel.payload));
  assert.equal(purchaseCancel.payload.purchase.status,"Cancelled");
  const paidPurchaseCancel=await request("/purchases/"+paidPurchaseId+"/cancel",{method:"POST",body:{}});
  assert.equal(paidPurchaseCancel.response.status,409);
  assert.match(paidPurchaseCancel.payload.message,/supplier payments recorded/i);
  updatedProduct=await Product.findOne({_id:productId,createdBy:ownerId}).lean();
  assert.equal(updatedProduct.quantity,2);

  const historyAfterCancel=await request("/products/"+productId+"/stock-movements");
  assert.ok(historyAfterCancel.payload.movements.some(item=>item.movementType==="purchase_cancelled"));

  const otherSupplierList=await request("/suppliers",{token:otherToken});
  assert.equal(otherSupplierList.response.status,200);
  assert.equal(otherSupplierList.payload.suppliers.length,1);
  assert.equal(String(otherSupplierList.payload.suppliers[0]._id),String(otherSupplierId));

  const otherPurchaseList=await request("/purchases",{token:otherToken});
  assert.equal(otherPurchaseList.response.status,200);
  assert.equal(otherPurchaseList.payload.purchases.length,0);

  const hiddenProductStock=await request("/products/"+productId+"/stock-movements",{token:otherToken});
  assert.equal(hiddenProductStock.response.status,404);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(ownerId){
   await StockMovement.deleteMany({createdBy:ownerId});
   await Expense.deleteMany({createdBy:ownerId});
   if(orderId)await Order.deleteOne({_id:orderId,createdBy:ownerId});
   if(purchaseId)await Purchase.deleteOne({_id:purchaseId,createdBy:ownerId});
   if(paidPurchaseId)await Purchase.deleteOne({_id:paidPurchaseId,createdBy:ownerId});
   if(productId)await Product.deleteOne({_id:productId,createdBy:ownerId});
   if(supplierId)await Supplier.deleteOne({_id:supplierId,createdBy:ownerId});
   if(expenseSupplierId)await Supplier.deleteOne({_id:expenseSupplierId,createdBy:ownerId});
  }
  if(otherOwnerId&&otherSupplierId)await Supplier.deleteOne({_id:otherSupplierId,createdBy:otherOwnerId});
  if(mongoose.connection.readyState===1)await mongoose.disconnect();
 }
});
