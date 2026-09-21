const mongoose=require("mongoose");

const ProductSchema=new mongoose.Schema({
  productName:{type:String,required:true,trim:true},
  productCode:{type:String,required:true,unique:true,uppercase:true,trim:true,index:true},
  description:{type:String,trim:true,default:""},
  rate:{type:Number,required:true,min:0},
  quantity:{type:Number,default:0,min:0},
  minStock:{type:Number,default:0,min:0},
  serialNumber:{type:String,unique:true,sparse:true,trim:true},
  designNo:{type:String,sparse:true,trim:true},
  purchaseDate:{type:Date,default:null},
  purchasePrice:{type:Number,default:0,min:0},
  images:[{type:String}],
  barcode:{type:String,trim:true,index:true},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true}
},{timestamps:true});

ProductSchema.index({createdBy:1,productName:1});
ProductSchema.index({createdBy:1,designNo:1});
ProductSchema.index({createdBy:1,quantity:1});

module.exports=mongoose.model("Product",ProductSchema);
