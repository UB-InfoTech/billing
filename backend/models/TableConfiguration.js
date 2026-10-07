const mongoose=require("mongoose");

const tableColumnSchema=new mongoose.Schema({
  key:{type:String,required:true,trim:true,maxlength:100},
  label:{type:String,required:true,trim:true,maxlength:120},
  visible:{type:Boolean,default:true},
  locked:{type:Boolean,default:false},
  kind:{type:String,enum:["field","merged","custom"],default:"field"},
  fieldType:{type:String,enum:["text","textarea","number","currency","date","datetime","boolean","select","multiselect","reference"],default:"text"},
  options:{type:[mongoose.Schema.Types.Mixed],default:[]},
  editable:{type:Boolean,default:true},
  dataSource:{type:mongoose.Schema.Types.Mixed,default:null},
  defaultValue:{type:mongoose.Schema.Types.Mixed,default:""},
  sourceKeys:{type:[String],default:[]},
  separator:{type:String,default:" "},
  order:{type:Number,default:0,min:0},
  width:{type:Number,default:0,min:0,max:12},
},{_id:false});

const tableConfigurationSchema=new mongoose.Schema({
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
  tableKey:{type:String,required:true,trim:true,maxlength:120},
  columns:{type:[tableColumnSchema],default:[]},
},{timestamps:true,versionKey:false});

tableConfigurationSchema.index({createdBy:1,tableKey:1},{unique:true});

module.exports=mongoose.model("TableConfiguration",tableConfigurationSchema);
