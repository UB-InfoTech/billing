const mongoose=require("mongoose");

const clientActivitySchema=new mongoose.Schema({
  clientId:{type:mongoose.Schema.Types.ObjectId,ref:"Client",required:true,index:true},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
  type:{type:String,enum:["note","call","email","meeting","follow_up","task","whatsapp","profile_update","other"],required:true},
  subject:{type:String,required:true,trim:true,maxlength:160},
  description:{type:String,trim:true,default:"",maxlength:4000},
  occurredAt:{type:Date,required:true,default:Date.now},
  dueAt:{type:Date,default:null},
  status:{type:String,enum:["open","completed","cancelled"],default:"completed"},
  completedAt:{type:Date,default:null}
},{timestamps:true});

clientActivitySchema.index({createdBy:1,clientId:1,occurredAt:-1});
clientActivitySchema.index({createdBy:1,clientId:1,status:1,dueAt:1});

module.exports=mongoose.model("ClientActivity",clientActivitySchema);
