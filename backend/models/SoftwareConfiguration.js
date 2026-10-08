const mongoose=require("mongoose");

const navigationItemSchema=new mongoose.Schema({
  key:{type:String,required:true,trim:true,maxlength:80},
  label:{type:String,trim:true,maxlength:100},
  visible:{type:Boolean,default:true},
  order:{type:Number,default:0,min:0},
},{_id:false});

const softwareConfigurationSchema=new mongoose.Schema({
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
  navigation:{type:[navigationItemSchema],default:[]},
  appearance:{
    compactMode:{type:Boolean,default:false},
    showPageHelp:{type:Boolean,default:true}
  },
},{timestamps:true,versionKey:false});

softwareConfigurationSchema.index({createdBy:1},{unique:true});

module.exports=mongoose.model("SoftwareConfiguration",softwareConfigurationSchema);
