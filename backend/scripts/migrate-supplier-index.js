require("dotenv").config();
const mongoose=require("mongoose");
const Supplier=require("../models/Supplier");

const uri=process.env.MONGO_URI||process.env.MONGODB_URI;

async function main(){
 if(!uri)throw new Error("Set MONGO_URI or MONGODB_URI before running this migration.");
 await mongoose.connect(uri);
 const collection=Supplier.collection;
 const indexes=await collection.indexes();
 const legacyUnique=indexes.find(index=>
  index.unique===true
  &&Object.keys(index.key||{}).length===1
  &&index.key?.gstin===1
 );
 if(legacyUnique){
  await collection.dropIndex(legacyUnique.name);
  console.log("Removed legacy global supplier GSTIN index:",legacyUnique.name);
 }

 const duplicates=await collection.aggregate([
  {$match:{createdBy:{$type:"objectId"},gstin:{$type:"string",$gt:""}}},
  {$group:{_id:{createdBy:"$createdBy",gstin:"$gstin"},count:{$sum:1},ids:{$push:"$_id"}}},
  {$match:{count:{$gt:1}}},
  {$limit:20}
 ]).toArray();
 if(duplicates.length){
  throw new Error("Duplicate GSTIN values exist within one business account. Resolve these supplier records, then rerun the migration: "+JSON.stringify(duplicates));
 }

 await collection.createIndex(
  {createdBy:1,gstin:1},
  {
   unique:true,
   partialFilterExpression:{createdBy:{$type:"objectId"},gstin:{$type:"string",$gt:""}},
   name:"createdBy_1_gstin_1"
  }
 );
 const unowned=await collection.countDocuments({createdBy:{$exists:false}});
 if(unowned){
  console.warn(unowned+" legacy supplier record(s) have no business owner and remain hidden. Assign each record to its correct business manually before using it.");
 }
 console.log("Supplier indexes are ready.");
}

main().catch(error=>{
 console.error("Supplier index migration failed:",error.message||error);
 process.exitCode=1;
}).finally(async()=>{
 if(mongoose.connection.readyState)await mongoose.disconnect();
});
