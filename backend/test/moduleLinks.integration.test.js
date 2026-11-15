const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const mongoose=require("mongoose");
const jwt=require("jsonwebtoken");

process.env.JWT_SECRET ||= "module-links-integration-tests-only-secret";
const app=require("../server");
const Product=require("../models/Product");
const Order=require("../models/Order2");
const Client=require("../models/Client");
const Deal=require("../models/Deal");
const DealActivity=require("../models/DealActivity");
const ClientActivity=require("../models/ClientActivity");
const SalesPipeline=require("../models/SalesPipeline");

const mongoUri=process.env.MONGO_URI;

test("linked module records remain owner-scoped and appear in customer/product views",{
 skip:!mongoUri?"Set MONGO_URI to run module linking integration tests.":false
},async()=>{
 let server,ownerId,otherOwnerId,clientId,productId;
 const createdDealIds=[];
 try{
  await mongoose.connect(mongoUri,{serverSelectionTimeoutMS:10000});
  await Promise.all([
   Product.init(),Order.init(),Client.init(),Deal.init(),
   DealActivity.init(),ClientActivity.init(),SalesPipeline.init()
  ]);
  ownerId=new mongoose.Types.ObjectId();
  otherOwnerId=new mongoose.Types.ObjectId();
  const ownerToken=jwt.sign({user:{id:String(ownerId)}},process.env.JWT_SECRET);
  const otherToken=jwt.sign({user:{id:String(otherOwnerId)}},process.env.JWT_SECRET);
  const suffix=crypto.randomBytes(5).toString("hex");
  const client=await Client.create({
   name:"Linked customer "+suffix,
   companyName:"Linked business "+suffix,
   phone:"9876543210",
   createdBy:ownerId
  });
  clientId=client._id;
  const product=await Product.create({
   productName:"Linked product "+suffix,
   productCode:"LP"+suffix.toUpperCase(),
   rate:125,
   quantity:40,
   createdBy:ownerId
  });
  productId=product._id;
  const order=await Order.create({
   orderNumber:"LINK-"+suffix.toUpperCase(),
   orderDate:new Date(),
   clientId,
   companyName:client.companyName,
   status:"Pending",
   taxPercentage:5,
   discountRate:0,
   subOrders:[{
    productId,
    orderName:product.productName,
    designNumber:"DL-"+suffix,
    qtyUnit:"PCS",
    quantity:3,
    unitPrice:125
   }],
   createdBy:ownerId
  });

  const pipeline=await SalesPipeline.findOne({createdBy:ownerId}).lean();
  const stage=pipeline?.stages?.find(item=>item.outcome==="open");
  assert.ok(stage,"An open sales stage should be available.");
  const deal=await Deal.create({
   title:"Linked opportunity "+suffix,
   clientId,
   contactName:client.name,
   value:50000,
   stageKey:stage.key,
   status:"open",
   probability:stage.probability,
   createdBy:ownerId,
   stageHistory:[{
    stageKey:stage.key,
    stageLabel:stage.label,
    previousStageKey:"",
    enteredAt:new Date(),
    changedBy:ownerId
   }]
  });
  createdDealIds.push(deal._id);
  const dealActivity=await DealActivity.create({
   dealId:deal._id,createdBy:ownerId,type:"follow_up",
   subject:"Call about sample approval",
   description:"Discuss the sample before preparing the next quotation.",
   occurredAt:new Date(),dueAt:new Date(Date.now()+60*60*1000),status:"open"
  });

  server=app.listen(0,"127.0.0.1");
  await new Promise((resolve,reject)=>{
   server.once("listening",resolve);server.once("error",reject);
  });
  const base="http://127.0.0.1:"+server.address().port+"/api";
  const request=async(path,token=ownerToken)=>{
   const response=await fetch(base+path,{headers:{"x-auth-token":token}});
   const text=await response.text();
   let payload;
   try{payload=text?JSON.parse(text):null;}catch{payload=text;}
   return {response,payload};
  };

  const usage=await request("/products/"+productId+"/usage");
  assert.equal(usage.response.status,200,JSON.stringify(usage.payload));
  assert.equal(usage.payload.totalInvoices,1);
  assert.equal(usage.payload.invoices[0].invoiceId,String(order._id));
  assert.equal(usage.payload.invoices[0].customerId,String(clientId));
  assert.equal(usage.payload.invoices[0].lines.length,1);
  assert.equal(usage.payload.invoices[0].lines[0].quantity,3);

  const hiddenUsage=await request("/products/"+productId+"/usage",otherToken);
  assert.equal(hiddenUsage.response.status,404);

  const timeline=await request("/clients/"+clientId+"/activities");
  assert.equal(timeline.response.status,200,JSON.stringify(timeline.payload));
  const opportunityEntry=timeline.payload.activities.find(item=>
   item.source==="deal"&&item.sourceId===String(deal._id)&&item.type==="deal_created"
  );
  assert.ok(opportunityEntry,"The linked opportunity should appear in the customer timeline.");
  const activityEntry=timeline.payload.activities.find(item=>
   item.source==="deal_activity"&&item.sourceId===String(dealActivity._id)
  );
  assert.ok(activityEntry,"Opportunity activity should appear in the customer timeline.");
  assert.equal(activityEntry.dealId,String(deal._id));
  assert.equal(activityEntry.canUpdateStatus,true);

  const hiddenTimeline=await request("/clients/"+clientId+"/activities",otherToken);
  assert.equal(hiddenTimeline.response.status,404);

  const sources=await request("/no-code-data/sources");
  assert.equal(sources.response.status,200);
  const sourceKeys=(sources.payload.sources||[]).map(item=>item.key);
  for(const key of ["deals","creditNotes","calendar"])assert.ok(sourceKeys.includes(key),key+" should be available as a linked-record source.");

  const dealSource=await request("/no-code-data/deals");
  assert.equal(dealSource.response.status,200);
  assert.ok(dealSource.payload.records.some(item=>String(item._id)===String(deal._id)));
  const hiddenDealSource=await request("/no-code-data/deals",otherToken);
  assert.equal(hiddenDealSource.response.status,200);
  assert.equal(hiddenDealSource.payload.records.length,0);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(ownerId){
   await DealActivity.deleteMany({createdBy:ownerId});
   await ClientActivity.deleteMany({createdBy:ownerId});
   await Deal.deleteMany({createdBy:ownerId});
   await Order.deleteMany({createdBy:ownerId,orderNumber:{$regex:"^LINK-"}});
   await Product.deleteMany({_id:productId,createdBy:ownerId});
   await SalesPipeline.deleteMany({createdBy:{$in:[ownerId,otherOwnerId]}});
   await Client.deleteMany({_id:clientId,createdBy:ownerId});
  }
  if(mongoose.connection.readyState===1)await mongoose.disconnect();
 }
});
