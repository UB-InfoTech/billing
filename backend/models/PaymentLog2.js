const mongoose=require("mongoose");
const PaymentLogSchema=new mongoose.Schema({
  reference:{type:String,required:true,trim:true,maxlength:100,index:true},
  method:{type:String,enum:["Cash","Bank Transfer","UPI","Cheque","Bank"],required:true},
  totalAmount:{type:Number,required:true,min:0.01},
  splitType:{type:String,enum:["proportional","custom"],required:true},
  paymentDate:{type:Date,required:true},
  userId:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
  allocations:[{
    orderId:{type:mongoose.Schema.Types.ObjectId,ref:"Order2",required:true},
    appliedAmount:{type:Number,required:true,min:0},
    orderNumber:{type:String,default:""},
    clientName:{type:String,default:""}
  }],
  skippedOrders:[{orderId:{type:mongoose.Schema.Types.ObjectId,ref:"Order2"},reason:{type:String,default:"fully_paid"}}],
  transactionMetadata:{requestId:String,processingTimeMs:{type:Number,min:0},batchSize:{type:Number,min:1},ipAddress:String,userAgent:{type:String,maxlength:500}},
  status:{type:String,enum:["completed","partially_completed","failed"],default:"completed"},
  errorDetails:{code:String,message:String,recoverable:Boolean}
},{timestamps:true,versionKey:false});
PaymentLogSchema.index({userId:1,createdAt:-1});
PaymentLogSchema.index({reference:1,createdAt:-1});
PaymentLogSchema.pre("validate",function(next){
  const allocated=(this.allocations||[]).reduce((s,x)=>s+Number(x.appliedAmount||0),0);
  if(Math.abs(allocated-Number(this.totalAmount||0))>0.01)return next(new Error("Payment allocation must equal payment amount."));
  next();
});
module.exports=mongoose.model("PaymentLog2",PaymentLogSchema);
