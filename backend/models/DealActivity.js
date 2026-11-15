const mongoose=require("mongoose");

const dealActivitySchema=new mongoose.Schema({
 dealId:{type:mongoose.Schema.Types.ObjectId,ref:"Deal",required:true,index:true},
 createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
 type:{type:String,enum:["note","call","email","meeting","whatsapp","quotation","follow_up","task","other"],required:true},
 subject:{type:String,required:true,trim:true,maxlength:160},
 description:{type:String,trim:true,default:"",maxlength:4000},
 occurredAt:{type:Date,required:true,default:Date.now},
 dueAt:{type:Date,default:null},
 status:{type:String,enum:["open","completed","cancelled"],default:"completed"},
 completedAt:{type:Date,default:null}
},{timestamps:true});

dealActivitySchema.index({createdBy:1,dealId:1,occurredAt:-1});
dealActivitySchema.index({createdBy:1,type:1,status:1,dueAt:1});

module.exports=mongoose.model("DealActivity",dealActivitySchema);
