const mongoose=require("mongoose");

const PAYMENT_METHODS=["Cash","Bank Transfer","UPI","Cheque","Bank"];
const STATUSES=["Pending","In Process","Completed","Cancelled","Dispatched"];

function round2(v){
  return Math.round((Number(v||0)+Number.EPSILON)*100)/100;
}

function calculateFinancials(data){
  const subOrders=Array.isArray(data.subOrders)?data.subOrders:[];
  const discountRate=Math.min(100,Math.max(0,Number(data.discountRate||0)));
  const taxPercentage=Math.min(100,Math.max(0,Number(data.taxPercentage??5)));

  const base=subOrders.reduce((total,sub)=>{
    const unit=sub.qtyUnit||"PCS";
    const qty=Number(sub.quantity||0);
    const mtr=Number(sub.MTR||0);
    const short=Number(sub.shortPcs||0);
    const price=Math.max(0,Number(sub.unitPrice||0));
    const billable=unit==="MTR"?Math.max(0,mtr-short):Math.max(0,qty-short);
    return total+(billable*price);
  },0);

  const discount=round2(base*discountRate/100);
  const totalCost=round2(base-discount);
  const tax=round2(totalCost*taxPercentage/100);
  const finalRevenue=round2(totalCost+tax);
  const rounded=Math.round(finalRevenue);
  const roundOff=round2(rounded-finalRevenue);

  const payments=Array.isArray(data.payments)?data.payments:[];
  const paidAmount=round2(payments.reduce((s,p)=>s+Math.max(0,Number(p.amount||0)),0));
  const creditAppliedAmount=Math.min(
    rounded,
    Math.max(0,round2(Number(data.creditAppliedAmount||0)))
  );
  const dueAmount=Math.max(0,round2(rounded-paidAmount-creditAppliedAmount));

  const paymentStatus=dueAmount<=0
    ?"Paid"
    :(paidAmount+creditAppliedAmount)>0
      ?"Partial"
      :"Unpaid";

  return {
    discountAmount:discount,
    totalCost,
    taxAmount:tax,
    finalRevenue,
    roundOffFinalRevenue:rounded,
    dueAmount,
    paidAmount,
    paymentStatus,
    totalAmount:rounded,
    roundOff,
  };
}

const paymentSchema=new mongoose.Schema({
  _id:{type:mongoose.Schema.Types.ObjectId,auto:true},
  amount:{type:Number,required:true,min:0},
  paymentDate:{type:Date,default:Date.now},
  createdAt:{type:Date,default:Date.now},
  method:{type:String,enum:PAYMENT_METHODS,default:"Cash"},
  amountReference:{type:String,trim:true,default:""},
  processedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null}
},{_id:false});

const subOrderSchema=new mongoose.Schema({
  productId:{type:mongoose.Schema.Types.ObjectId,ref:"Product",default:null},
  designNumber:{type:String,trim:true,default:""},
  orderName:{type:String,trim:true,default:""},
  hsnCode:{type:Number,default:null},
  qtyUnit:{type:String,trim:true,default:"PCS"},
  quantity:{type:Number,default:0,min:0},
  cut:{type:Number,default:0,min:0},
  MTR:{type:Number,default:0,min:0},
  unitPrice:{type:Number,default:0,min:0},
  shortPcs:{type:Number,default:0,min:0},
},{_id:true});

const orderSchema=new mongoose.Schema({
  orderNumber:{type:String,trim:true,index:true},
  challanNumber:{type:String,trim:true,default:""},
  lrNo:{type:String,trim:true,default:""},
  orderDate:{type:Date,default:Date.now,index:true},
  subOrders:{type:[subOrderSchema],default:[]},
  Address:{type:String,default:""},
  State:{type:String,default:""},
  City:{type:String,default:""},
  pinCode:{type:String,default:""},
  stateCode:{type:String,default:""},
  clientId:{type:mongoose.Schema.Types.ObjectId,ref:"Client",default:null,index:true},
  gstNumber:{type:String,trim:true,default:""},
  companyName:{type:String,trim:true,default:""},
  status:{type:String,enum:STATUSES,default:"Pending",index:true},
  paymentTerms:{type:String,enum:["30","60","90","Advance"],default:"30"},
  statusHistory:[{status:{type:String,enum:STATUSES},timestamp:{type:Date,default:Date.now}}],
  paymentStatus:{type:String,enum:["Unpaid","Partial","Paid"],default:"Unpaid",index:true},
  payments:{type:[paymentSchema],default:[]},
  taxPercentage:{type:Number,default:5,min:0,max:100},
  taxAmount:{type:Number,default:0,min:0},
  discountRate:{type:Number,default:0,min:0,max:100},
  discountAmount:{type:Number,default:0,min:0},
  totalCost:{type:Number,default:0,min:0},
  paidAmount:{type:Number,default:0,min:0},
  dueAmount:{type:Number,default:0,min:0},
  totalAmount:{type:Number,default:0,min:0},
  finalRevenue:{type:Number,default:0,min:0},
  roundOffFinalRevenue:{type:Number,default:0,min:0},
  roundOff:{type:Number,default:0},
  creditAppliedAmount:{type:Number,default:0,min:0},
  creditNoteCount:{type:Number,default:0,min:0},
  lastPaymentDate:{type:Date,default:null},
  note:{type:String,trim:true,default:""},
  netProfit:{type:Number,default:0},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
  ewbDetails:{
    ewbNo:{type:String,default:""},
    ewbDate:{type:String,default:""},
    validTill:{type:String,default:""},
    alert:{type:String,default:""},
    status:{type:String,default:null},
  },
},{timestamps:true});

orderSchema.index({createdBy:1,orderDate:-1});
orderSchema.index({createdBy:1,status:1,paymentStatus:1});
orderSchema.index({createdBy:1,clientId:1,orderDate:-1});
orderSchema.index({createdBy:1,orderNumber:1});

function applyFinancials(doc){
  const calc=calculateFinancials(doc);
  Object.assign(doc,calc);
  if(!Array.isArray(doc.statusHistory))doc.statusHistory=[];
  if(!doc.statusHistory.length)doc.statusHistory.push({status:doc.status,timestamp:new Date()});
}

orderSchema.pre("save",function(next){
  try{applyFinancials(this);next();}catch(err){next(err);}
});

orderSchema.pre("findOneAndUpdate",async function(next){
  try{
    const current=await this.model.findOne(this.getQuery()).lean();
    if(!current)return next();

    const update=this.getUpdate()||{};
    const set={...(update.$set||{})};
    const merged={...current,...set};

    if(update.$push?.payments?.$each)merged.payments=[...(current.payments||[]),...(update.$push.payments.$each||[])];
    else if(update.$push?.payments)merged.payments=[...(current.payments||[]),update.$push.payments];

    if(update.$pull?.payments)merged.payments=(current.payments||[]).filter(p=>String(p._id)!==String(update.$pull.payments._id||update.$pull.payments));

    const calc=calculateFinancials(merged);
    this.setUpdate({...update,$set:{...set,...calc}});
    next();
  }catch(err){next(err);}
});

orderSchema.statics.calculateFinancials=calculateFinancials;
orderSchema.statics.round2=round2;

module.exports=mongoose.model("Order2",orderSchema);
