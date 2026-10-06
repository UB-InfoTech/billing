const mongoose=require("mongoose");

const dataSourceSchema=new mongoose.Schema({
  type:{type:String,enum:["none","lookup"],default:"none"},
  resource:{type:String,trim:true,default:""},
  valueField:{type:String,trim:true,default:"_id",maxlength:100},
  labelField:{type:String,trim:true,default:"",maxlength:100},
  searchField:{type:String,trim:true,default:"",maxlength:100},
  autoFill:[{
    targetKey:{type:String,trim:true,maxlength:100},
    sourceKey:{type:String,trim:true,maxlength:100}
  }]
},{_id:false});

const conditionSchema=new mongoose.Schema({
  action:{type:String,enum:["show","hide","require","readonly"],default:"show"},
  fieldKey:{type:String,trim:true,maxlength:100},
  operator:{type:String,enum:["equals","not_equals","contains","not_contains","greater_than","less_than","empty","not_empty"],default:"equals"},
  value:{type:String,default:"",maxlength:300}
},{_id:false});

const formFieldSchema=new mongoose.Schema({
  key:{type:String,required:true,trim:true,maxlength:100},
  label:{type:String,required:true,trim:true,maxlength:120},
  visible:{type:Boolean,default:true},
  required:{type:Boolean,default:false},
  locked:{type:Boolean,default:false},
  custom:{type:Boolean,default:false},
  editable:{type:Boolean,default:true},
  readOnly:{type:Boolean,default:false},
  fieldType:{type:String,enum:["text","textarea","number","currency","date","datetime","select","boolean"],default:"text"},
  width:{type:Number,default:6,min:1,max:12},
  order:{type:Number,default:0,min:0},
  section:{type:String,trim:true,default:"header",maxlength:50},
  options:{type:[String],default:[]},
  formula:{type:String,default:"",maxlength:300},
  defaultValue:{type:mongoose.Schema.Types.Mixed,default:""},
  dataSource:{type:dataSourceSchema,default:()=>({type:"none"})},
  conditions:{type:[conditionSchema],default:[]},
  validation:{
    min:{type:Number,default:null},
    max:{type:Number,default:null},
    pattern:{type:String,default:"",maxlength:500}
  }
},{_id:false});

const formConfigurationSchema=new mongoose.Schema({
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
  formKey:{type:String,required:true,trim:true,maxlength:120},
  fields:{type:[formFieldSchema],default:[]}
},{timestamps:true,versionKey:false});

formConfigurationSchema.index({createdBy:1,formKey:1},{unique:true});

module.exports=mongoose.model("FormConfiguration",formConfigurationSchema);
