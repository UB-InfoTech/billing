const mongoose=require("mongoose");

const widgetSchema=new mongoose.Schema({
  key:{type:String,required:true,trim:true,maxlength:50},
  title:{type:String,required:true,trim:true,maxlength:80},
  visible:{type:Boolean,default:true},
  order:{type:Number,default:0,min:0}
},{_id:false});

const reportConfigurationSchema=new mongoose.Schema({
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
  widgets:{type:[widgetSchema],default:[]}
},{timestamps:true,versionKey:false});

reportConfigurationSchema.index({createdBy:1},{unique:true});

module.exports=mongoose.model("ReportConfiguration",reportConfigurationSchema);
