const express=require("express");
const multer=require("multer");
const fs=require("fs");
const mongoose=require("mongoose");
const auth=require("../middleware/auth");
const FormConfiguration=require("../models/FormConfiguration");
const NoCodeFile=require("../models/NoCodeFile");
const {
  NO_CODE_FILE_DIR,getNoCodeFileType,isAllowedNoCodeFileType,hasNoCodeFileSignature,
  createNoCodeFileFilename,getOwnedNoCodeFilePath,sanitizeNoCodeOriginalName
}=require("../utils/noCodeFileStorage");
const router=express.Router();
const upload=multer({
  storage:multer.memoryStorage(),
  limits:{files:1,fileSize:10*1024*1024},
  fileFilter:(_,file,callback)=>{
    if(!getNoCodeFileType(file.mimetype))return callback(new Error("Choose a JPG, PNG, GIF, WebP or PDF file."));
    return callback(null,true);
  }
});
const owner=req=>String(req.user?.id||"");
const FORM_FILE_UPLOAD_KEYS=new Set(["clients.form","products.form","expenses.form","calendar.event","profile.form","orders.form","orders.items","creditnotes.form"]);
const receiveUpload=(req,res,next)=>{
  upload.single("file")(req,res,error=>{
    if(!error)return next();
    const status=error.code==="LIMIT_FILE_SIZE"?413:400;
    const message=error.code==="LIMIT_FILE_SIZE"?"Files must be 10 MB or smaller."
      :error.code==="LIMIT_UNEXPECTED_FILE"?"Choose one file at a time."
        :error.message||"Unable to upload this file.";
    return res.status(status).json({message});
  });
};
const fileResponse=file=>({
  id:String(file._id),name:file.originalName,mimeType:file.mimeType,size:file.size,
  fieldType:file.fieldType,downloadUrl:"/api/no-code-files/"+String(file._id)+"/download"
});
router.post("/upload",auth,receiveUpload,async(req,res)=>{
  if(!req.file)return res.status(400).json({message:"Choose a file first."});
  let storedPath="";
  try{
    const formKey=String(req.body?.formKey||"").trim().slice(0,120);
    const fieldKey=String(req.body?.fieldKey||"").trim().slice(0,100);
    const accountId=owner(req);
    if(!FORM_FILE_UPLOAD_KEYS.has(formKey))return res.status(400).json({message:"File uploads are not enabled for this form."});
    if(!mongoose.isValidObjectId(accountId))return res.status(401).json({message:"Your business account could not be verified."});
    if(!/^[A-Za-z][A-Za-z0-9_-]{0,99}$/.test(fieldKey))return res.status(400).json({message:"Choose a valid file field."});
    const configuration=await FormConfiguration.findOne({createdBy:accountId,formKey}).select("fields").lean();
    const field=(configuration?.fields||[]).find(item=>item.key===fieldKey&&item.custom===true&&["image","file"].includes(item.fieldType));
    if(!field)return res.status(400).json({message:"This upload field is no longer available. Refresh the form and try again."});
    if(!isAllowedNoCodeFileType(field.fieldType,req.file.mimetype)){
      return res.status(400).json({message:field.fieldType==="image"?"Choose a JPG, PNG, GIF or WebP image.":"Choose a JPG, PNG, GIF, WebP or PDF file."});
    }
    if(!hasNoCodeFileSignature(req.file.buffer,req.file.mimetype))return res.status(400).json({message:"The selected file content does not match its file type."});
    const filename=createNoCodeFileFilename(accountId,req.file.mimetype);
    await fs.promises.mkdir(NO_CODE_FILE_DIR,{recursive:true});
    storedPath=getOwnedNoCodeFilePath(filename,accountId);
    await fs.promises.writeFile(storedPath,req.file.buffer,{flag:"wx",mode:0o600});
    const saved=await NoCodeFile.create({
      createdBy:accountId,formKey,fieldKey,fieldType:field.fieldType,filename,
      originalName:sanitizeNoCodeOriginalName(req.file.originalname),
      mimeType:String(req.file.mimetype).toLowerCase(),size:req.file.size
    });
    return res.status(201).json({file:fileResponse(saved)});
  }catch(error){
    if(storedPath)await fs.promises.unlink(storedPath).catch(()=>{});
    return res.status(400).json({message:error.message||"Unable to save this file."});
  }
});
router.get("/:id/download",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(404).json({message:"File not found."});
    const file=await NoCodeFile.findOne({_id:req.params.id,createdBy:owner(req)}).lean();
    if(!file)return res.status(404).json({message:"File not found."});
    const filePath=getOwnedNoCodeFilePath(file.filename,owner(req));
    if(!filePath)return res.status(404).json({message:"File not found."});
    try{await fs.promises.access(filePath,fs.constants.R_OK);}catch{return res.status(404).json({message:"File not found."});}
    const encodedName=encodeURIComponent(file.originalName||"download");
    res.setHeader("Content-Type",file.mimeType);
    res.setHeader("Content-Length",String(file.size));
    res.setHeader("X-Content-Type-Options","nosniff");
    res.setHeader("Cache-Control","private, no-store");
    res.setHeader("Content-Disposition",file.fieldType==="image"?`inline; filename="image"; filename*=UTF-8''${encodedName}`:`attachment; filename="download"; filename*=UTF-8''${encodedName}`);
    return res.sendFile(filePath);
  }catch(error){return res.status(500).json({message:"Unable to open this file."});}
});
router.get("/:id",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(404).json({message:"File not found."});
    const file=await NoCodeFile.findOne({_id:req.params.id,createdBy:owner(req)}).lean();
    if(!file)return res.status(404).json({message:"File not found."});
    return res.json({file:fileResponse(file)});
  }catch(error){return res.status(500).json({message:"Unable to load this file."});}
});
module.exports=router;
