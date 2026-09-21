const express=require("express");
const mongoose=require("mongoose");
const Client=require("../models/Client");
const Order=require("../models/Order2");
const auth=require("../middleware/auth");

const router=express.Router();
const owner=req=>req.user.id;

router.get("/summary",auth,async(req,res)=>{
  try{
    const uid=new mongoose.Types.ObjectId(owner(req));
    const [count,active,inactive,financial]=await Promise.all([
      Client.countDocuments({createdBy:uid}),
      Client.countDocuments({createdBy:uid,accountStatus:"Active"}),
      Client.countDocuments({createdBy:uid,accountStatus:"Inactive"}),
      Client.aggregate([{ $match:{createdBy:uid}},{$group:{_id:null,revenue:{$sum:"$totalRevenue"},paid:{$sum:"$totalPaid"},outstanding:{$sum:"$outstanding_balance"},averageOrderValue:{$avg:"$averageOrderValue"}}}])
    ]);
    res.json({count,active,inactive,totalRevenue:Number(financial[0]?.revenue||0),totalPaid:Number(financial[0]?.paid||0),outstanding_balance:Number(financial[0]?.outstanding||0),averageOrderValue:Number(financial[0]?.averageOrderValue||0)});
  }catch(error){res.status(500).json({message:error.message});}
});

router.get("/search",auth,async(req,res)=>{
  try{
    const query={createdBy:owner(req)};
    const q=String(req.query.q||req.query.name||"").trim();
    if(q){const rx=new RegExp(q.replace(/[.*+?^$()|[\]\\]/g,"\\$&"),"i");query.$or=[{name:rx},{companyName:rx},{email:rx},{phone:rx},{gstNumber:rx}];}
    if(req.query.businessType)query.businessType=req.query.businessType;
    if(req.query.accountStatus)query.accountStatus=req.query.accountStatus;
    const minRevenue=Number(req.query.minRevenue),maxRevenue=Number(req.query.maxRevenue);
    if(Number.isFinite(minRevenue)||Number.isFinite(maxRevenue)){query.totalRevenue={};if(Number.isFinite(minRevenue))query.totalRevenue.$gte=minRevenue;if(Number.isFinite(maxRevenue))query.totalRevenue.$lte=maxRevenue;}
    res.json(await Client.find(query).sort({companyName:1,name:1}).lean());
  }catch(error){res.status(500).json({message:error.message});}
});

router.get("/",auth,async(req,res)=>{
  try{
    const query={createdBy:owner(req)};
    if(req.query.businessType)query.businessType=req.query.businessType;
    if(req.query.accountStatus)query.accountStatus=req.query.accountStatus;
    const q=String(req.query.search||"").trim();
    if(q){const rx=new RegExp(q.replace(/[.*+?^$()|[\]\\]/g,"\\$&"),"i");query.$or=[{name:rx},{companyName:rx},{email:rx},{phone:rx},{gstNumber:rx}];}
    const minRevenue=Number(req.query.minRevenue),maxRevenue=Number(req.query.maxRevenue);
    if(Number.isFinite(minRevenue)||Number.isFinite(maxRevenue)){query.totalRevenue={};if(Number.isFinite(minRevenue))query.totalRevenue.$gte=minRevenue;if(Number.isFinite(maxRevenue))query.totalRevenue.$lte=maxRevenue;}
    const sortField=["name","companyName","totalRevenue","orderCount","lastOrderDate","createdAt"].includes(req.query.sort)?req.query.sort:"createdAt";
    const sortDir=req.query.order==="asc"?1:-1;
    res.json(await Client.find(query).sort({[sortField]:sortDir}).lean());
  }catch(error){res.status(500).json({message:error.message});}
});

router.get("/:id",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid client ID."});
    const client=await Client.findOne({_id:req.params.id,createdBy:owner(req)}).lean();
    if(!client)return res.status(404).json({message:"Client not found"});
    res.json(client);
  }catch(error){res.status(500).json({message:error.message});}
});

router.post("/",auth,async(req,res)=>{
  try{
    const body={...(req.body||{})};
    body.createdBy=owner(req);
    if(body.gstNumber)body.gstNumber=String(body.gstNumber).trim().toUpperCase();
    const client=new Client(body);
    await client.save();
    res.status(201).json(client);
  }catch(error){res.status(400).json({message:error.message});}
});

router.patch("/:id",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid client ID."});
    const client=await Client.findOne({_id:req.params.id,createdBy:owner(req)});
    if(!client)return res.status(404).json({message:"Client not found"});
    const allowed=["name","email","phone","address","state","city","pinCode","stateCode","gstNumber","companyName","businessType","paymentTerms","loyaltyPoints","discountRate","accountStatus","notes"];
    for(const key of allowed)if(req.body?.[key]!==undefined)client[key]=req.body[key];
    if(client.gstNumber)client.gstNumber=String(client.gstNumber).trim().toUpperCase();
    await client.save();
    res.json(client);
  }catch(error){res.status(400).json({message:error.message});}
});

router.put("/:id/credit",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid client ID."});
    const amount=Number(req.body?.amount);
    if(!Number.isFinite(amount)||amount===0)return res.status(400).json({message:"A non-zero credit adjustment is required."});
    const client=await Client.findOne({_id:req.params.id,createdBy:owner(req)});
    if(!client)return res.status(404).json({message:"Client not found"});
    const next=Number(client.creditBalance||0)+amount;
    if(next<0)return res.status(400).json({message:"Credit balance cannot become negative."});
    client.creditBalance=next;await client.save();res.json(client);
  }catch(error){res.status(400).json({message:error.message});}
});

router.get("/:id/transactions",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid client ID."});
    const client=await Client.findOne({_id:req.params.id,createdBy:owner(req)}).select("_id");
    if(!client)return res.status(404).json({message:"Client not found"});
    const orders=await Order.find({clientId:client._id,createdBy:owner(req)}).sort({orderDate:-1}).lean();
    const transactions=[];
    for(const order of orders){
      transactions.push({type:"Invoice",orderId:order._id,orderNumber:order.orderNumber,date:order.orderDate,amount:Number(order.roundOffFinalRevenue||0),paid:Number(order.paidAmount||0),due:Number(order.dueAmount||0),status:order.paymentStatus});
      for(const payment of order.payments||[])transactions.push({type:"Payment",orderId:order._id,orderNumber:order.orderNumber,paymentId:payment._id,date:payment.paymentDate||payment.createdAt,amount:Number(payment.amount||0),method:payment.method,reference:payment.amountReference});
    }
    res.json(transactions.sort((a,b)=>new Date(b.date)-new Date(a.date)));
  }catch(error){res.status(500).json({message:error.message});}
});

router.delete("/:id",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid client ID."});
    const linked=await Order.exists({clientId:req.params.id,createdBy:owner(req)});
    if(linked)return res.status(400).json({message:"Client cannot be deleted because invoices are linked to this client. Mark the client Inactive instead."});
    const client=await Client.findOneAndDelete({_id:req.params.id,createdBy:owner(req)});
    if(!client)return res.status(404).json({message:"Client not found"});
    res.json({message:"Client deleted successfully"});
  }catch(error){res.status(500).json({message:error.message});}
});

module.exports=router;
