const mongoose=require("mongoose");

const supplierSchema=new mongoose.Schema({
  name:{type:String,required:true,trim:true,maxlength:160},
  legalName:{type:String,trim:true,default:"",maxlength:180},
  gstin:{type:String,trim:true,uppercase:true,default:"",maxlength:15},
  contact:{
    person:{type:String,trim:true,default:"",maxlength:120},
    email:{type:String,trim:true,lowercase:true,default:"",maxlength:160},
    phone:{type:String,trim:true,default:"",maxlength:30}
  },
  address:{type:String,trim:true,default:"",maxlength:1000},
  city:{type:String,trim:true,default:"",maxlength:100},
  state:{type:String,trim:true,default:"",maxlength:100},
  pinCode:{type:String,trim:true,default:"",maxlength:12},
  paymentTerms:{type:String,enum:["0","15","30","45","60","90"],default:"30"},
  notes:{type:String,trim:true,default:"",maxlength:4000},
  status:{type:String,enum:["Active","Inactive"],default:"Active"},
  reliability_score:{type:Number,default:100,min:0,max:100},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true}
},{timestamps:true});

supplierSchema.index({createdBy:1,name:1});
supplierSchema.index(
  {createdBy:1,gstin:1},
  {unique:true,partialFilterExpression:{createdBy:{$type:"objectId"},gstin:{$type:"string",$gt:""}},name:"createdBy_1_gstin_1"}
);

module.exports=mongoose.model("Supplier",supplierSchema);
