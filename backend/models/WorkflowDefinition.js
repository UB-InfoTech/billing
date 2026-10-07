const mongoose=require("mongoose");

const workflowConditionSchema=new mongoose.Schema({
  fieldKey:{type:String,trim:true,maxlength:100},
  operator:{type:String,enum:["equals","not_equals","contains","not_contains","greater_than","less_than","empty","not_empty"],default:"equals"},
  value:{type:String,default:"",maxlength:300}
},{_id:false});

const workflowActionSchema=new mongoose.Schema({
  type:{type:String,enum:["set_value","change_status","show_message"],default:"set_value"},
  fieldKey:{type:String,trim:true,maxlength:100},
  value:{type:mongoose.Schema.Types.Mixed,default:""},
  message:{type:String,default:"",maxlength:500}
},{_id:false});

const workflowSchema=new mongoose.Schema({
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
  name:{type:String,required:true,trim:true,maxlength:120},
  active:{type:Boolean,default:true},
  trigger:{
    event:{type:String,enum:["record_created","record_updated"],default:"record_updated"},
    resource:{type:String,enum:["orders","clients","products","expenses"],default:"orders"}
  },
  conditions:{type:[workflowConditionSchema],default:[]},
  actions:{type:[workflowActionSchema],default:[]}
},{timestamps:true,versionKey:false});

workflowSchema.index({createdBy:1,updatedAt:-1});

module.exports=mongoose.model("WorkflowDefinition",workflowSchema);
