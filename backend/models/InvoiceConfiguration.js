const mongoose=require("mongoose");

const itemColumnSchema=new mongoose.Schema({
  key:{type:String,required:true,trim:true,maxlength:50},
  label:{type:String,required:true,trim:true,maxlength:80},
  visible:{type:Boolean,default:true},
  order:{type:Number,default:0,min:0},
  width:{type:Number,default:8,min:3,max:30}
},{_id:false});

const invoiceConfigurationSchema=new mongoose.Schema({
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
  pageSize:{type:String,enum:["A4","A5","Letter"],default:"A4"},
  accentColor:{type:String,default:"#111827"},
  invoiceTitle:{type:String,default:"TAX INVOICE",maxlength:80},
  header:{
    showHeaderTitle:{type:Boolean,default:true},
    showCompanyName:{type:Boolean,default:true},
    showGST:{type:Boolean,default:true},
    showPhones:{type:Boolean,default:true},
    showAddress:{type:Boolean,default:true}
  },
  receiver:{
    showName:{type:Boolean,default:true},
    showAddress:{type:Boolean,default:true},
    showMobile:{type:Boolean,default:true},
    showState:{type:Boolean,default:true},
    showGSTIN:{type:Boolean,default:true}
  },
  invoiceDetails:{
    showChallan:{type:Boolean,default:true},
    showInvoiceNo:{type:Boolean,default:true},
    showInvoiceDate:{type:Boolean,default:true},
    showDueDate:{type:Boolean,default:true},
    showPaymentTerms:{type:Boolean,default:true},
    showEwayBill:{type:Boolean,default:true}
  },
  itemColumns:{type:[itemColumnSchema],default:[]},
  summary:{
    showDiscount:{type:Boolean,default:true},
    showTax:{type:Boolean,default:true},
    showRoundOff:{type:Boolean,default:true},
    showBankDetails:{type:Boolean,default:true},
    showTerms:{type:Boolean,default:true},
    showWebCredit:{type:Boolean,default:true}
  }
},{timestamps:true,versionKey:false});

invoiceConfigurationSchema.index({createdBy:1},{unique:true});

module.exports=mongoose.model("InvoiceConfiguration",invoiceConfigurationSchema);
