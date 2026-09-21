const mongoose = require("mongoose");

const ClientSchema = new mongoose.Schema({
  name:{type:String,trim:true,default:""},
  email:{type:String,trim:true,lowercase:true,default:""},
  phone:{type:String,trim:true,default:""},
  address:{type:String,trim:true,default:""},
  state:{type:String,trim:true,default:""},
  city:{type:String,trim:true,default:""},
  pinCode:{type:String,trim:true,default:""},
  stateCode:{type:String,trim:true,default:""},
  gstNumber:{type:String,trim:true,uppercase:true,default:""},
  companyName:{type:String,trim:true,default:""},
  businessType:{type:String,enum:["Retail","Wholesale","Manufacturer","Trader","Supplier","Other",""],default:""},
  orderCount:{type:Number,default:0,min:0},
  totalRevenue:{type:Number,default:0,min:0},
  lastOrderDate:{type:Date,default:null},
  totalPaid:{type:Number,default:0,min:0},
  payments:[{type:mongoose.Schema.Types.ObjectId,ref:"Order2"}],
  paymentHistory:[{type:mongoose.Schema.Types.ObjectId}],
  pendingPayments:{type:Number,default:0,min:0},
  outstanding_balance:{type:Number,default:0,min:0},
  creditBalance:{type:Number,default:0,min:0},
  paymentTerms:{type:String,enum:["30","60","90","Advance"],default:"30"},
  loyaltyPoints:{type:Number,default:0,min:0},
  discountRate:{type:Number,default:0,min:0,max:100},
  averageOrderValue:{type:Number,default:0,min:0},
  preferredProducts:[{type:String}],
  orderFrequency:{type:String,enum:["Daily","Weekly","Monthly","Occasional"],default:"Occasional"},
  accountStatus:{type:String,enum:["Active","Inactive"],default:"Active"},
  notes:{type:String,trim:true,default:""},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true}
},{timestamps:true});

ClientSchema.index({createdBy:1,companyName:1});
ClientSchema.index({createdBy:1,gstNumber:1});
ClientSchema.index({createdBy:1,accountStatus:1});
ClientSchema.index({createdBy:1,createdAt:-1});

module.exports=mongoose.model("Client",ClientSchema);
