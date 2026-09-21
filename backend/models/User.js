const mongoose=require("mongoose");

const userSchema=new mongoose.Schema({
  username:{type:String,required:true,unique:true,trim:true,minlength:2,maxlength:80},
  email:{type:String,required:true,unique:true,trim:true,lowercase:true,maxlength:160,index:true},
  password:{type:String,required:true,select:false,minlength:8},
},{timestamps:true});

module.exports=mongoose.model("User",userSchema);