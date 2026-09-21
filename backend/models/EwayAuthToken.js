const mongoose=require("mongoose");

const schema=new mongoose.Schema({
  token:{type:String,required:true,trim:true},
  tokenExp:{type:Date,required:true,index:true},
  createdBy:{type:String,required:true,index:true}
},{timestamps:true});
schema.index({createdBy:1,tokenExp:-1});
module.exports=mongoose.model("EwayAuthToken",schema);