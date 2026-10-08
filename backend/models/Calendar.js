const mongoose=require("mongoose");

const calendarEventSchema=new mongoose.Schema({
  title:{type:String,required:true,trim:true,maxlength:200},
  start:{type:Date,required:true},
  end:{type:Date,required:true},
  color:{type:String,default:"#3788d8",trim:true,maxlength:20},
  customFields:{type:Map,of:mongoose.Schema.Types.Mixed,default:{}},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true}
},{timestamps:true});

calendarEventSchema.index({createdBy:1,start:1});

module.exports=mongoose.model("Calendar",calendarEventSchema);
