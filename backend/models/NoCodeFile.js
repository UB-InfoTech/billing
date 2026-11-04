const mongoose=require("mongoose");
const noCodeFileSchema=new mongoose.Schema({
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
  formKey:{type:String,required:true,trim:true,maxlength:120},
  scope:{type:String,enum:["form","table"],default:"form",index:true},
  rowKey:{type:mongoose.Schema.Types.ObjectId,default:null},
  fieldKey:{type:String,required:true,trim:true,maxlength:100},
  fieldType:{type:String,enum:["image","file"],required:true},
  filename:{type:String,required:true,unique:true,trim:true,maxlength:100},
  originalName:{type:String,required:true,trim:true,maxlength:180},
  mimeType:{type:String,required:true,trim:true,maxlength:100},
  size:{type:Number,required:true,min:1,max:10*1024*1024}
},{timestamps:true,versionKey:false});
noCodeFileSchema.index({createdBy:1,formKey:1,fieldKey:1,createdAt:-1});
module.exports=mongoose.model("NoCodeFile",noCodeFileSchema);
