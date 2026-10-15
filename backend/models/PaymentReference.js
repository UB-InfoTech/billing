const mongoose=require("mongoose");

const paymentReferenceSchema=new mongoose.Schema({
  createdBy:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"User",
    required:true
  },
  reference:{
    type:String,
    required:true,
    trim:true,
    minlength:1,
    maxlength:100
  },
  kind:{
    type:String,
    enum:["single","bulk","historical"],
    required:true
  }
},{timestamps:true,versionKey:false});

// One reference identifies one payment transaction or one bulk-payment batch.
// A batch may apply that same reference to several invoices.
paymentReferenceSchema.index(
  {createdBy:1,reference:1},
  {unique:true,name:"uniq_payment_reference_per_owner"}
);

module.exports=mongoose.model("PaymentReference",paymentReferenceSchema);
