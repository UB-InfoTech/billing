const mongoose=require("mongoose");

const stageSchema=new mongoose.Schema({
 key:{type:String,required:true,trim:true,lowercase:true,maxlength:50},
 label:{type:String,required:true,trim:true,maxlength:48},
 probability:{type:Number,required:true,min:0,max:100},
 order:{type:Number,required:true,min:0},
 outcome:{type:String,enum:["open","won","lost"],required:true,default:"open"}
},{_id:false});

const salesPipelineSchema=new mongoose.Schema({
 createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
 name:{type:String,trim:true,default:"Sales pipeline",maxlength:80},
 stages:{type:[stageSchema],default:[]}
},{timestamps:true,versionKey:false});

salesPipelineSchema.index({createdBy:1},{unique:true});

module.exports=mongoose.model("SalesPipeline",salesPipelineSchema);
