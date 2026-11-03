const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("fs/promises");
const mongoose=require("mongoose");
const jwt=require("jsonwebtoken");

process.env.JWT_SECRET||="billing-integration-tests-only-secret";
const app=require("../server");
const FormConfiguration=require("../models/FormConfiguration");
const NoCodeFile=require("../models/NoCodeFile");
const {getOwnedNoCodeFilePath}=require("../utils/noCodeFileStorage");
const {validateConfiguredFileReferences}=require("../utils/configuredFormValidation");

const mongoUri=process.env.MONGO_URI;

test("no-code file uploads are authenticated, private and tied to their configured field",{
  skip:!mongoUri?"Set MONGO_URI to run no-code file integration tests.":false
},async()=>{
  let server;
  let ownerId;
  let otherOwnerId;
  let baseUrl;
  try{
    await mongoose.connect(mongoUri,{serverSelectionTimeoutMS:10000});
    await Promise.all([FormConfiguration.init(),NoCodeFile.init()]);
    ownerId=new mongoose.Types.ObjectId();
    otherOwnerId=new mongoose.Types.ObjectId();
    const ownerToken=jwt.sign({user:{id:String(ownerId)}},process.env.JWT_SECRET);
    const otherToken=jwt.sign({user:{id:String(otherOwnerId)}},process.env.JWT_SECRET);
    const fields=[
      {key:"businessLogo",label:"Business logo",custom:true,fieldType:"image"},
      {key:"supportingDocument",label:"Supporting document",custom:true,fieldType:"file"}
    ];
    await FormConfiguration.create({createdBy:ownerId,formKey:"clients.form",fields});
    server=app.listen(0,"127.0.0.1");
    await new Promise((resolve,reject)=>{server.once("listening",resolve);server.once("error",reject);});
    baseUrl="http://127.0.0.1:"+server.address().port+"/api";

    const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00]);
    const uploadForm=new FormData();
    uploadForm.append("formKey","clients.form");
    uploadForm.append("fieldKey","businessLogo");
    uploadForm.append("file",new Blob([png],{type:"image/png"}),"logo.png");
    const uploaded=await fetch(baseUrl+"/no-code-files/upload",{
      method:"POST",headers:{"x-auth-token":ownerToken},body:uploadForm
    });
    assert.equal(uploaded.status,201);
    const uploadedBody=await uploaded.json();
    const file=uploadedBody.file;
    assert.ok(file?.id);
    assert.equal(file.fieldType,"image");
    assert.equal(file.name,"logo.png");

    await assert.doesNotReject(()=>validateConfiguredFileReferences({
      ownerId,formKey:"clients.form",fields,customFields:{businessLogo:file.id}
    }));
    await assert.rejects(()=>validateConfiguredFileReferences({
      ownerId:otherOwnerId,formKey:"clients.form",fields,customFields:{businessLogo:file.id}
    }),/no longer available/i);
    await assert.rejects(()=>validateConfiguredFileReferences({
      ownerId,formKey:"clients.form",fields,customFields:{supportingDocument:file.id}
    }),/no longer available/i);

    const metadata=await fetch(baseUrl+"/no-code-files/"+file.id,{headers:{"x-auth-token":ownerToken}});
    assert.equal(metadata.status,200);
    const downloaded=await fetch(baseUrl.replace(/\/api$/,"")+file.downloadUrl,{headers:{"x-auth-token":ownerToken}});
    assert.equal(downloaded.status,200);
    assert.equal(downloaded.headers.get("content-type"),"image/png");
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),png);

    const otherMetadata=await fetch(baseUrl+"/no-code-files/"+file.id,{headers:{"x-auth-token":otherToken}});
    assert.equal(otherMetadata.status,404);
    const otherDownload=await fetch(baseUrl.replace(/\/api$/,"")+file.downloadUrl,{headers:{"x-auth-token":otherToken}});
    assert.equal(otherDownload.status,404);

    const spoofedForm=new FormData();
    spoofedForm.append("formKey","clients.form");
    spoofedForm.append("fieldKey","businessLogo");
    spoofedForm.append("file",new Blob([Buffer.from("%PDF-1.7")],{type:"image/png"}),"not-an-image.png");
    const spoofed=await fetch(baseUrl+"/no-code-files/upload",{
      method:"POST",headers:{"x-auth-token":ownerToken},body:spoofedForm
    });
    assert.equal(spoofed.status,400);

    const unsupportedFieldForm=new FormData();
    unsupportedFieldForm.append("formKey","clients.form");
    unsupportedFieldForm.append("fieldKey","notConfigured");
    unsupportedFieldForm.append("file",new Blob([png],{type:"image/png"}),"logo.png");
    const unsupported=await fetch(baseUrl+"/no-code-files/upload",{
      method:"POST",headers:{"x-auth-token":ownerToken},body:unsupportedFieldForm
    });
    assert.equal(unsupported.status,400);
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    if(ownerId){
      const saved=await NoCodeFile.find({createdBy:ownerId}).lean().catch(()=>[]);
      await Promise.all(saved.map(async file=>{
        const filePath=getOwnedNoCodeFilePath(file.filename,ownerId);
        if(filePath)await fs.unlink(filePath).catch(()=>{});
      }));
      await NoCodeFile.deleteMany({createdBy:ownerId}).catch(()=>{});
      await FormConfiguration.deleteOne({createdBy:ownerId,formKey:"clients.form"}).catch(()=>{});
    }
    await mongoose.disconnect();
  }
});
