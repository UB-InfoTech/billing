const mongoose=require("mongoose");

const ExpenseSchema=new mongoose.Schema({
  title:{type:String,trim:true,default:""},
  description:{type:String,required:true,trim:true},
  amount:{type:Number,required:true,min:0},
  category:{type:String,required:true,trim:true},
  subCategory:{type:String,trim:true,default:""},
  tags:[{type:String,trim:true}],
  paymentMethod:{type:String,enum:["Cash","Bank Transfer","UPI","Cheque","Credit"],default:"Cash"},
  currency:{type:String,trim:true,uppercase:true,default:"INR"},
  vendor:{type:String,trim:true,default:""},
  gstNo:{type:String,trim:true,uppercase:true,default:""},
  taxDeductible:{type:Boolean,default:false},
  taxRate:{type:Number,default:0,min:0,max:100},
  taxAmount:{type:Number,default:0,min:0},
  clientId:{type:mongoose.Schema.Types.ObjectId,ref:"Client",default:null},
  orderId:{type:mongoose.Schema.Types.ObjectId,ref:"Order2",default:null},
  date:{type:Date,default:Date.now,index:true},
  isRecurring:{type:Boolean,default:false},
  recurringInterval:{type:String,enum:["Daily","Weekly","Monthly","Yearly",null],default:null},
  recurringEndDate:{type:Date,default:null},
  notes:{type:String,trim:true,default:""},
  attachments:[{type:String}],
  receipt:{type:String,default:""},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
  updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null},
  user:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null}
},{timestamps:true});
ExpenseSchema.index({createdBy:1,date:-1});
ExpenseSchema.index({createdBy:1,category:1,date:-1});
ExpenseSchema.index({createdBy:1,vendor:1});
module.exports=mongoose.model("Expense",ExpenseSchema);