const mongoose=require("mongoose");

const formFieldSchema=new mongoose.Schema({
  key:{type:String,required:true,trim:true,maxlength:100},
  label:{type:String,required:true,trim:true,maxlength:120},
  visible:{type:Boolean,default:true},
  required:{type:Boolean,default:false},
  locked:{type:Boolean,default:false},
  fieldType:{type:String,enum:["text","textarea","number","currency","date","datetime","select","boolean"],default:"text"},
  width:{type:Number,default:6,min:1,max:12},
  order:{type:Number,default:0,min:0},
  section:{type:String,enum:["header","client","items","other"],default:"header"},
  options:{type:[String],default:[]},
  formula:{type:String,default:"",maxlength:300}
},{_id:false});

const formConfigurationSchema=new mongoose.Schema({
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
  formKey:{type:String,required:true,trim:true,maxlength:120},
  fields:{type:[formFieldSchema],default:[]}
},{timestamps:true,versionKey:false});

formConfigurationSchema.index({createdBy:1,formKey:1},{unique:true});

module.exports=mongoose.model("FormConfiguration",formConfigurationSchema);
