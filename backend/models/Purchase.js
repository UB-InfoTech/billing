const mongoose=require("mongoose");

const purchaseItemSchema=new mongoose.Schema({
  productId:{type:mongoose.Schema.Types.ObjectId,ref:"Product",required:true},
  productName:{type:String,required:true,trim:true},
  productCode:{type:String,trim:true,default:""},
  quantity:{type:Number,required:true,min:0.0001},
  unit:{type:String,enum:["PCS","MTR"],required:true,default:"PCS"},
  unitCost:{type:Number,required:true,min:0},
  discountRate:{type:Number,default:0,min:0,max:100},
  taxRate:{type:Number,default:0,min:0,max:100},
  subtotal:{type:Number,default:0,min:0},
  discountAmount:{type:Number,default:0,min:0},
  taxableAmount:{type:Number,default:0,min:0},
  taxAmount:{type:Number,default:0,min:0},
  totalAmount:{type:Number,default:0,min:0}
},{_id:true});

const purchasePaymentSchema=new mongoose.Schema({
  _id:{type:mongoose.Schema.Types.ObjectId,auto:true},
  amount:{type:Number,required:true,min:0.01},
  method:{type:String,enum:["Cash","Bank Transfer","UPI","Cheque","Bank"],default:"Bank Transfer"},
  reference:{type:String,trim:true,default:"",maxlength:120},
  paidAt:{type:Date,default:Date.now},
  note:{type:String,trim:true,default:"",maxlength:300}
},{_id:false});

const purchaseSchema=new mongoose.Schema({
  purchaseNumber:{type:String,required:true,trim:true,uppercase:true},
  supplierId:{type:mongoose.Schema.Types.ObjectId,ref:"Supplier",required:true,index:true},
  supplierName:{type:String,required:true,trim:true},
  supplierGstin:{type:String,trim:true,default:""},
  supplierInvoiceNumber:{type:String,trim:true,default:"",maxlength:80},
  purchaseDate:{type:Date,required:true,default:Date.now},
  dueDate:{type:Date,default:null},
  status:{type:String,enum:["Received","Cancelled"],default:"Received",index:true},
  receivedAt:{type:Date,default:Date.now},
  cancelledAt:{type:Date,default:null},
  items:{type:[purchaseItemSchema],required:true,validate:{
    validator:value=>Array.isArray(value)&&value.length>0,
    message:"A purchase must contain at least one product."
  }},
  subtotal:{type:Number,default:0,min:0},
  discountAmount:{type:Number,default:0,min:0},
  taxAmount:{type:Number,default:0,min:0},
  grandTotal:{type:Number,default:0,min:0},
  paidAmount:{type:Number,default:0,min:0},
  dueAmount:{type:Number,default:0,min:0},
  payments:{type:[purchasePaymentSchema],default:[]},
  notes:{type:String,trim:true,default:"",maxlength:4000},
  stockMovementIds:[{type:mongoose.Schema.Types.ObjectId,ref:"StockMovement"}],
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true}
},{timestamps:true});

purchaseSchema.index({createdBy:1,purchaseNumber:1},{unique:true,name:"createdBy_1_purchaseNumber_1"});
purchaseSchema.index({createdBy:1,supplierId:1,purchaseDate:-1});
purchaseSchema.index({createdBy:1,status:1,purchaseDate:-1});
purchaseSchema.index(
  {createdBy:1,supplierId:1,supplierInvoiceNumber:1},
  {unique:true,partialFilterExpression:{supplierInvoiceNumber:{$type:"string",$gt:""}},name:"createdBy_1_supplierId_1_supplierInvoiceNumber_1"}
);

module.exports=mongoose.model("Purchase",purchaseSchema);
