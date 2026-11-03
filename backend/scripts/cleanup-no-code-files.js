const fs=require("fs");
const dotenv=require("dotenv");
const mongoose=require("mongoose");
const NoCodeFile=require("../models/NoCodeFile");
const {getOwnedNoCodeFilePath}=require("../utils/noCodeFileStorage");
const Client=require("../models/Client");
const Product=require("../models/Product");
const Expense=require("../models/Expense");
const Calendar=require("../models/Calendar");
const Profile=require("../models/Profile");
const Order=require("../models/Order2");
const CreditNote=require("../models/CreditNote");

dotenv.config();

const DAY_MS=24*60*60*1000;
const RETENTION_DAYS=Math.max(30,Number(process.env.NO_CODE_FILE_RETENTION_DAYS)||30);
const MODEL_BY_FORM=Object.freeze({
  "clients.form":Client,
  "products.form":Product,
  "expenses.form":Expense,
  "calendar.event":Calendar,
  "profile.form":Profile,
  "orders.form":Order,
  "orders.items":Order,
  "creditnotes.form":CreditNote
});

const buildNoCodeFileReferenceQuery=file=>{
  const model=MODEL_BY_FORM[file?.formKey];
  if(!model||!file?.fieldKey||!file?.createdBy||!file?._id)return null;
  const fieldPath="customFields."+file.fieldKey;
  const referenceId=String(file._id);
  if(file.formKey==="orders.items"){
    return {model:Order,query:{
      createdBy:file.createdBy,
      subOrders:{$elemMatch:{[fieldPath]:referenceId}}
    }};
  }
  if(file.formKey==="orders.form"){
    return {model:Order,query:{createdBy:file.createdBy,[fieldPath]:referenceId}};
  }
  return {model,query:{createdBy:file.createdBy,[fieldPath]:referenceId}};
};

async function cleanupNoCodeFiles({retentionDays=RETENTION_DAYS,now=new Date()}={}){
  const safeDays=Math.max(30,Number(retentionDays)||30);
  const cutoff=new Date(now.getTime()-safeDays*DAY_MS);
  const candidates=await NoCodeFile.find({createdAt:{$lt:cutoff}}).lean();
  const result={examined:candidates.length,referenced:0,deleted:0,skipped:0,failed:0,cutoff:cutoff.toISOString()};
  for(const file of candidates){
    const reference=buildNoCodeFileReferenceQuery(file);
    // Unknown or incomplete form mappings must never cause automatic deletion.
    if(!reference){result.skipped+=1;continue;}
    try{
      const used=await reference.model.exists(reference.query);
      if(used){result.referenced+=1;continue;}
      const filePath=getOwnedNoCodeFilePath(file.filename,file.createdBy);
      if(!filePath){result.skipped+=1;continue;}
      await fs.promises.unlink(filePath).catch(error=>{
        if(error.code!=="ENOENT")throw error;
      });
      const removed=await NoCodeFile.deleteOne({_id:file._id,createdBy:file.createdBy,createdAt:{$lt:cutoff}});
      if(removed.deletedCount)result.deleted+=1;
      else result.skipped+=1;
    }catch(error){
      result.failed+=1;
      process.stderr.write("Could not clean no-code file "+String(file._id)+": "+error.message+"\\n");
    }
  }
  return result;
}

if(require.main===module){
  if(!process.env.MONGO_URI){
    process.stderr.write("MONGO_URI is required.\\n");
    process.exitCode=1;
  }else{
    mongoose.connect(process.env.MONGO_URI,{serverSelectionTimeoutMS:10000})
      .then(async()=>{
        const result=await cleanupNoCodeFiles();
        process.stdout.write("No-code file cleanup: "+JSON.stringify(result)+"\\n");
        if(result.failed)process.exitCode=1;
      })
      .catch(error=>{
        process.stderr.write("No-code file cleanup failed: "+error.message+"\\n");
        process.exitCode=1;
      })
      .finally(()=>mongoose.disconnect());
  }
}

module.exports={buildNoCodeFileReferenceQuery,cleanupNoCodeFiles};
