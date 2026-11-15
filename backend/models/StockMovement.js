const mongoose=require("mongoose");

const stockMovementSchema=new mongoose.Schema({
  productId:{type:mongoose.Schema.Types.ObjectId,ref:"Product",required:true,index:true},
  productName:{type:String,trim:true,default:""},
  productCode:{type:String,trim:true,default:""},
  movementType:{type:String,enum:[
    "purchase_received","purchase_cancelled","invoice_sale","invoice_cancelled",
    "credit_note_return","credit_note_reversal","manual_adjustment"
  ],required:true},
  sourceType:{type:String,enum:["purchase","invoice","credit_note","manual"],required:true},
  sourceId:{type:mongoose.Schema.Types.ObjectId,default:null},
  sourceItemId:{type:mongoose.Schema.Types.ObjectId,default:null},
  reference:{type:String,trim:true,default:"",maxlength:120},
  unit:{type:String,enum:["PCS","MTR"],required:true,default:"PCS"},
  quantityChange:{type:Number,required:true},
  quantityBefore:{type:Number,required:true,min:0},
  quantityAfter:{type:Number,required:true,min:0},
  note:{type:String,trim:true,default:"",maxlength:500},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true}
},{timestamps:true});

stockMovementSchema.index({createdBy:1,productId:1,createdAt:-1});
stockMovementSchema.index({createdBy:1,sourceType:1,sourceId:1});
stockMovementSchema.index({createdBy:1,movementType:1,createdAt:-1});

module.exports=mongoose.model("StockMovement",stockMovementSchema);
