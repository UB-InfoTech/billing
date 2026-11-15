const mongoose=require("mongoose");

const stageHistorySchema=new mongoose.Schema({
 stageKey:{type:String,required:true,trim:true,maxlength:50},
 stageLabel:{type:String,required:true,trim:true,maxlength:48},
 previousStageKey:{type:String,default:"",trim:true,maxlength:50},
 enteredAt:{type:Date,required:true,default:Date.now},
 changedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true}
},{_id:false});

const dealSchema=new mongoose.Schema({
 title:{type:String,required:true,trim:true,maxlength:160},
 clientId:{type:mongoose.Schema.Types.ObjectId,ref:"Client",default:null,index:true},
 contactName:{type:String,trim:true,default:"",maxlength:120},
 contactPhone:{type:String,trim:true,default:"",maxlength:30},
 contactEmail:{type:String,trim:true,lowercase:true,default:"",maxlength:160},
 value:{type:Number,required:true,min:0,max:1000000000000,default:0},
 currency:{type:String,trim:true,uppercase:true,default:"INR",maxlength:3},
 stageKey:{type:String,required:true,trim:true,maxlength:50},
 status:{type:String,enum:["open","won","lost"],default:"open",index:true},
 probability:{type:Number,default:10,min:0,max:100},
 expectedCloseDate:{type:Date,default:null},
 nextAction:{type:String,trim:true,default:"",maxlength:160},
 nextActionAt:{type:Date,default:null},
 source:{type:String,trim:true,default:"",maxlength:80},
 notes:{type:String,trim:true,default:"",maxlength:5000},
 lostReason:{type:String,trim:true,default:"",maxlength:160},
 lostNotes:{type:String,trim:true,default:"",maxlength:2000},
 closedAt:{type:Date,default:null},
 stageHistory:{type:[stageHistorySchema],default:[]},
 createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true}
},{timestamps:true});

dealSchema.index({createdBy:1,status:1,stageKey:1});
dealSchema.index({createdBy:1,nextActionAt:1,status:1});
dealSchema.index({createdBy:1,expectedCloseDate:1,status:1});
dealSchema.index({createdBy:1,clientId:1,updatedAt:-1});

module.exports=mongoose.model("Deal",dealSchema);
