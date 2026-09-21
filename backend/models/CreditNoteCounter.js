const mongoose=require("mongoose");
const schema=new mongoose.Schema({_id:{type:String,required:true},value:{type:Number,default:0,min:0}},{timestamps:true});
module.exports=mongoose.model("CreditNoteCounter",schema,"credit_note_counters");
