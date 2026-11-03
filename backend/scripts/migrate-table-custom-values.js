require("dotenv").config();
const mongoose=require("mongoose");
const TableCustomValue=require("../models/TableCustomValue");
const {migrateLegacyTableCustomValue}=require("../utils/tableCustomFieldPersistence");

async function migrateTableCustomValues(){
  if(!process.env.MONGO_URI)throw new Error("MONGO_URI is required.");
  await mongoose.connect(process.env.MONGO_URI,{autoIndex:false,serverSelectionTimeoutMS:10000});
  const counts={migrated:0,alreadyPresent:0,empty:0,unsupported:0,invalid:0,missingRecord:0};
  const cursor=TableCustomValue.find({}).lean().cursor();
  for await(const legacy of cursor){
    const result=await migrateLegacyTableCustomValue(legacy,TableCustomValue);
    if(result.status==="migrated")counts.migrated+=1;
    else if(result.status==="already-present")counts.alreadyPresent+=1;
    else if(result.status==="empty")counts.empty+=1;
    else if(result.status==="unsupported")counts.unsupported+=1;
    else if(result.status==="invalid")counts.invalid+=1;
    else if(result.status==="missing-record")counts.missingRecord+=1;
  }
  console.log("Table custom-field migration results:");
  console.log(JSON.stringify(counts,null,2));
  console.log("Unsupported summary-table values and values whose source records no longer exist were retained for manual review.");
}

migrateTableCustomValues()
  .catch(error=>{console.error("Table custom-field migration failed:",error);process.exitCode=1;})
  .finally(async()=>{await mongoose.disconnect().catch(()=>{});});
