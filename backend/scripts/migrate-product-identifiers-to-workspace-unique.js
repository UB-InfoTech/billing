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

  console.log("Product code and serial number uniqueness is now scoped by business account.");
}

migrateProductIndexes()
  .catch(error=>{
    console.error("Product index migration failed:",error);
    process.exitCode=1;
  })
  .finally(async()=>{
    await mongoose.disconnect().catch(()=>{});
  });
