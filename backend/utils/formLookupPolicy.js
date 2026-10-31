const Client=require("../models/Client");
const Product=require("../models/Product");
const Order=require("../models/Order2");
const Expense=require("../models/Expense");
const User=require("../models/User");
const {isNoCodeSourceSafe,buildNoCodeSourceQuery}=require("./noCodeSourcePolicy");

const FORM_LOOKUP_SOURCES={
  clients:{
    model:Client,
    fields:["name","companyName","phone","email","address","pinCode","stateCode","gstNumber","state","city","paymentTerms","discountRate","accountStatus"]
  },
  products:{
    model:Product,
    fields:["productName","productCode","designNo","rate","quantity","minStock","description","purchasePrice","barcode"]
  },
  orders:{
    model:Order,
    fields:["orderNumber","companyName","orderDate","totalAmount","paidAmount","dueAmount","paymentStatus","status"]
  },
  expenses:{
    model:Expense,
    fields:["title","category","subCategory","amount","paymentMethod","vendor","taxRate","date","gstNo"]
  },
  users:{
    model:User,
    fields:["username","email"]
  }
};

const getFormLookupSource=resource=>{
  const source=FORM_LOOKUP_SOURCES[String(resource||"").trim()];
  if(!source||!isNoCodeSourceSafe(source.model,User))return null;
  return source;
};

const getFormLookupQuery=(resource,ownerId)=>{
  const source=getFormLookupSource(resource);
  if(!source)return null;
  return buildNoCodeSourceQuery(source.model,ownerId,User);
};

module.exports={
  FORM_LOOKUP_SOURCES,
  getFormLookupSource,
  getFormLookupQuery
};
