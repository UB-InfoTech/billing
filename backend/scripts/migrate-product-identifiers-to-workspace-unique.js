require("dotenv").config();
const mongoose=require("mongoose");
const Product=require("../models/Product");

const MONGO_URI=process.env.MONGO_URI;

function hasExactSingleKey(index,key){
  return index&&index.key&&Object.keys(index.key).length===1&&index.key[key]===1;
}

async function migrateProductIndexes(){
  if(!MONGO_URI)throw new Error("MONGO_URI is required.");

  await mongoose.connect(MONGO_URI,{
    autoIndex:false,
    serverSelectionTimeoutMS:10000
  });

  const collection=Product.collection;
  const existing=await collection.indexes();

  // Barcodes were previously protected only by an application-level lookup.
  // Refuse to create the unique index when legacy duplicates exist; never
  // silently edit or delete products as part of an index migration.
  const duplicateBarcodes=await collection.aggregate([
    {$match:{createdBy:{$type:"objectId"},barcode:{$type:"string",$gt:""}}},
    {$group:{_id:{createdBy:"$createdBy",barcode:"$barcode"},count:{$sum:1},productIds:{$push:"$_id"}}},
    {$match:{count:{$gt:1}}},
    {$limit:10}
  ]).toArray();
  if(duplicateBarcodes.length){
    const examples=duplicateBarcodes.map(row=>
      `business ${row._id.createdBy}, barcode "${row._id.barcode}" (${row.count} products)`
    ).join("; ");
    throw new Error(
      "Cannot enforce business-unique barcodes until duplicates are reviewed and corrected. Examples: "+examples
    );
  }

  // Build account-scoped unique indexes first. The existing global indexes are
  // retained until the replacements exist, so uniqueness is never left open.
  await collection.createIndex(
    {createdBy:1,productCode:1},
    {unique:true,name:"createdBy_1_productCode_1"}
  );
  await collection.createIndex(
    {createdBy:1,serialNumber:1},
    {
      unique:true,
      partialFilterExpression:{serialNumber:{$type:"string"}},
      name:"createdBy_1_serialNumber_1"
    }
  );
  await collection.createIndex(
    {createdBy:1,barcode:1},
    {
      unique:true,
      partialFilterExpression:{createdBy:{$type:"objectId"},barcode:{$type:"string",$gt:""}},
      name:"createdBy_1_barcode_1"
    }
  );

  for(const index of existing){
    const oldGlobalProductCode=index.unique===true&&hasExactSingleKey(index,"productCode");
    const oldGlobalSerial=index.unique===true&&hasExactSingleKey(index,"serialNumber");
    if((oldGlobalProductCode||oldGlobalSerial)&&index.name!=="_id_"){
      await collection.dropIndex(index.name);
      console.log("Removed global unique index:",index.name);
    }
  }

  const orphaned=await collection.countDocuments({
    $or:[{createdBy:{$exists:false}},{createdBy:null}]
  });
  if(orphaned){
    console.warn(
      orphaned+" legacy product record(s) have no business owner. Review these records before assigning them to accounts."
    );
  }

  console.log("Product code, serial number, and non-empty barcode uniqueness is now scoped by business account.");
}

migrateProductIndexes()
  .catch(error=>{
    console.error("Product index migration failed:",error);
    process.exitCode=1;
  })
  .finally(async()=>{
    await mongoose.disconnect().catch(()=>{});
  });
