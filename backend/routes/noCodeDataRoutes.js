const express=require("express");
const auth=require("../middleware/auth");
const Client=require("../models/Client");
const Product=require("../models/Product");
const Order=require("../models/Order2");
const Expense=require("../models/Expense");
const Supplier=require("../models/Supplier");
const Machine=require("../models/Machine");
const User=require("../models/User");

const router=express.Router();
const owner=req=>req.user.id;

const SOURCES={
  clients:{
    label:"Clients",
    model:Client,
    searchFields:["name","companyName","phone","gstNumber"],
    fields:[
      ["name","Client Name"],["companyName","Company Name"],["phone","Phone"],
      ["email","Email"],["gstNumber","GST Number"],["state","State"],["city","City"],
      ["paymentTerms","Payment Terms"],["discountRate","Discount Rate"],["accountStatus","Account Status"]
    ]
  },
  products:{
    label:"Products",
    model:Product,
    searchFields:["productName","productCode","designNo","barcode"],
    fields:[
      ["productName","Product Name"],["productCode","Product Code"],["designNo","Design No."],
      ["rate","Rate"],["quantity","Stock"],["minStock","Minimum Stock"],["description","Description"],
      ["purchasePrice","Purchase Price"],["barcode","Barcode"]
    ]
  },
  orders:{
    label:"Invoices",
    model:Order,
    searchFields:["orderNumber","companyName","gstNumber","challanNumber"],
    fields:[
      ["orderNumber","Invoice No."],["companyName","Client"],["orderDate","Bill Date"],
      ["totalAmount","Total"],["paidAmount","Paid"],["dueAmount","Due"],
      ["paymentStatus","Payment Status"],["status","Status"]
    ]
  },
  expenses:{
    label:"Expenses",
    model:Expense,
    searchFields:["title","category","subCategory","vendor","gstNo"],
    fields:[
      ["title","Title"],["category","Category"],["subCategory","Sub Category"],
      ["amount","Amount"],["paymentMethod","Payment Method"],["vendor","Vendor"],
      ["taxRate","Tax Rate"],["date","Date"]
    ]
  },
  suppliers:{
    label:"Suppliers",
    model:Supplier,
    searchFields:["name","gstin"],
    fields:[["name","Supplier Name"],["gstin","GSTIN"],["reliability_score","Reliability Score"]]
  },
  users:{
    label:"Team members",
    model:User,
    searchFields:["username","email"],
    fields:[["username","Name"],["email","Email"]]
  },
  machines:{
    label:"Machines",
    model:Machine,
    searchFields:["name"],
    fields:[["name","Machine Name"],["totalOrdersProcessed","Orders Processed"],["totalRevenueGenerated","Revenue Generated"],["downtimeHours","Downtime Hours"]]
  }
};

const cleanString=(value,max=120)=>String(value??"").trim().slice(0,max);

router.get("/sources",auth,(req,res)=>{
  res.json({
    sources:Object.entries(SOURCES).map(([key,source])=>({
      key,
      label:source.label,
      fields:source.fields.map(([value,label])=>({value,label}))
    }))
  });
});

router.get("/:source",auth,async(req,res)=>{
  try{
    const key=cleanString(req.params.source,50);
    const source=SOURCES[key];
    if(!source)return res.status(404).json({message:"Data source not available."});

    const q=cleanString(req.query.q,100);
    const limit=Math.min(Math.max(Number(req.query.limit)||100,1),200);
    const query={};
    if(source.model.schema.path("createdBy"))query.createdBy=owner(req);

    if(q){
      const escaped=q.replace(/[.*+?^$()|[\]\\]/g,"\\$&");
      const regex=new RegExp(escaped,"i");
      query.$or=source.searchFields.filter(field=>source.model.schema.path(field)).map(field=>({[field]:regex}));
    }

    let cursor=source.model.find(query).limit(limit);
    const sortField=source.searchFields.find(field=>source.model.schema.path(field)&&source.model.schema.path(field).instance==="String");
    if(sortField)cursor=cursor.sort({[sortField]:1});

    const records=await cursor.lean();
    return res.json({
      source:key,
      label:source.label,
      fields:source.fields.map(([value,label])=>({value,label})),
      records
    });
  }catch(error){
    return res.status(500).json({message:error.message});
  }
});

module.exports=router;
