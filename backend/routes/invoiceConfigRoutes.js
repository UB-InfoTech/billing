const express=require("express");
const mongoose=require("mongoose");
const InvoiceConfiguration=require("../models/InvoiceConfiguration");
const auth=require("../middleware/auth");

const router=express.Router();
const owner=req=>String(req.user.id);
const clean=(value,max)=>String(value??"").trim().slice(0,max);

const DEFAULT_COLUMNS=[
  ["sr","Sr",5],["description","Desc.",17],["designNumber","Design No.",13],["hsnCode","HSN",9],
  ["quantity","Qty",8],["qtyUnit","Unit",5],["cut","Cut",7],["MTR","MTR",7],
  ["unitPrice","Rate",8],["amount","Amount",8],["discount","Disc.",7],["taxable","Taxable",12]
];

const defaults=()=>({
  pageSize:"A4",
  accentColor:"#111827",
  invoiceTitle:"TAX INVOICE",
  header:{showHeaderTitle:true,showCompanyName:true,showGST:true,showPhones:true,showAddress:true},
  receiver:{showName:true,showAddress:true,showMobile:true,showState:true,showGSTIN:true},
  invoiceDetails:{showChallan:true,showInvoiceNo:true,showInvoiceDate:true,showDueDate:true,showPaymentTerms:true,showEwayBill:true},
  itemColumns:DEFAULT_COLUMNS.map(([key,label,width],order)=>({key,label,width,visible:true,order})),
  summary:{showDiscount:true,showTax:true,showRoundOff:true,showBankDetails:true,showTerms:true,showWebCredit:true}
});

const sanitize=(input={})=>{
  const base=defaults();
  const itemMap=new Map(base.itemColumns.map(item=>[item.key,item]));
  const incoming=Array.isArray(input.itemColumns)?input.itemColumns:[];
  incoming.slice(0,30).forEach((item,index)=>{
    const key=clean(item?.key,50);
    const original=itemMap.get(key);
    if(!original)return;
    itemMap.set(key,{
      ...original,
      label:clean(item?.label||original.label,80)||original.label,
      visible:item?.visible!==false,
      width:Math.min(30,Math.max(3,Number(item?.width)||original.width)),
      order:Number.isFinite(Number(item?.order))?Math.max(0,Number(item.order)):index
    });
  });
  return {
    pageSize:["A4","A5","Letter"].includes(input?.pageSize)?input.pageSize:base.pageSize,
    accentColor:/^#[0-9A-F]{6}$/i.test(String(input?.accentColor||""))?String(input.accentColor):base.accentColor,
    invoiceTitle:clean(input?.invoiceTitle||base.invoiceTitle,80)||base.invoiceTitle,
    header:{...base.header,...(input?.header||{})},
    receiver:{...base.receiver,...(input?.receiver||{})},
    invoiceDetails:{...base.invoiceDetails,...(input?.invoiceDetails||{})},
    itemColumns:[...itemMap.values()].sort((a,b)=>(a.order||0)-(b.order||0)).map((item,index)=>({...item,order:index})),
    summary:{...base.summary,...(input?.summary||{})}
  };
};

router.get("/",auth,async(req,res)=>{
  try{
    const saved=await InvoiceConfiguration.findOne({createdBy:owner(req)}).lean();
    return res.json(saved?sanitize(saved):sanitize({}));
  }catch(error){return res.status(500).json({message:error.message});}
});

router.put("/",auth,async(req,res)=>{
  try{
    const config=sanitize(req.body||{});
    const saved=await InvoiceConfiguration.findOneAndUpdate(
      {createdBy:new mongoose.Types.ObjectId(owner(req))},
      {$set:config},
      {new:true,upsert:true,runValidators:true,setDefaultsOnInsert:true}
    ).lean();
    return res.json(sanitize(saved));
  }catch(error){return res.status(400).json({message:error.message});}
});

router.post("/reset",auth,async(req,res)=>{
  try{
    const saved=await InvoiceConfiguration.findOneAndUpdate(
      {createdBy:new mongoose.Types.ObjectId(owner(req))},
      {$set:defaults()},
      {new:true,upsert:true,runValidators:true,setDefaultsOnInsert:true}
    ).lean();
    return res.json(sanitize(saved));
  }catch(error){return res.status(400).json({message:error.message});}
});

module.exports=router;
