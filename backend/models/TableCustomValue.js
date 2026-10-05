const mongoose=require("mongoose");

const tableCustomValueSchema=new mongoose.Schema({
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
  tableKey:{type:String,required:true,trim:true,maxlength:120},
  rowKey:{type:String,required:true,trim:true,maxlength:200},
  fieldKey:{type:String,required:true,trim:true,maxlength:100},
  value:{type:mongoose.Schema.Types.Mixed,default:null},
},{timestamps:true,versionKey:false});

tableCustomValueSchema.index({createdBy:1,tableKey:1,rowKey:1,fieldKey:1},{unique:true});
tableCustomValueSchema.index({createdBy:1,tableKey:1,fieldKey:1});

module.exports=mongoose.model("TableCustomValue",tableCustomValueSchema);
