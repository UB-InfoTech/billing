const express=require("express");
const multer=require("multer");
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const Profile=require("../models/Profile");
const auth=require("../middleware/auth");
const {toPublicProfile}=require("../utils/publicProfile");
const {normalizeInvoiceSequence}=require("../utils/invoiceSequence");
const {getSafeUploadExtension}=require("../utils/uploadFileTypes");
const {
  getOwnedOrganizationLogoFilename,
  getPublicOrganizationLogoUrl,
  hasSupportedOrganizationLogoSignature
}=require("../utils/organizationLogo");
const {
  loadConfiguredFormFields,
  calculateConfiguredCustomFields,
  hasConfiguredCustomCalculations
}=require("../utils/customFieldCalculations");
const {
  prepareConfiguredFormValues,
  validateConfiguredFormValues
}=require("../utils/configuredFormValidation");

const router=express.Router();
const logoUploadDir=path.join(__dirname,"../public/uploads/organization-logos");
fs.mkdirSync(logoUploadDir,{recursive:true});

const organizationLogoUpload=multer({
  storage:multer.diskStorage({
    destination:(_,__,callback)=>callback(null,logoUploadDir),
    filename:(req,file,callback)=>{
      const accountId=String(req.user?.id||"").trim();
      const extension=getSafeUploadExtension(file.mimetype);
      if(!/^[a-f0-9]{24}$/i.test(accountId)||!extension){
        return callback(new Error("Your account or logo file could not be verified."));
      }
      callback(null,accountId+"-"+crypto.randomBytes(12).toString("hex")+extension);
    }
  }),
  limits:{files:1,fileSize:2*1024*1024},
  fileFilter:(_,file,callback)=>{
    if(!["image/jpeg","image/png","image/webp"].includes(String(file.mimetype||"").toLowerCase())){
      return callback(new Error("Choose a JPG, PNG or WebP image for your organization logo."));
    }
    return callback(null,true);
  }
});

const removeOrganizationLogo=async(value,ownerId)=>{
  const filename=getOwnedOrganizationLogoFilename(value,ownerId);
  if(!filename)return;
  try{
    await fs.promises.unlink(path.join(logoUploadDir,filename));
  }catch(error){
    if(error.code!=="ENOENT"){
      console.warn("Unable to remove an old organization logo:",error.message);
    }
  }
};

const receiveOrganizationLogo=(req,res,next)=>{
  organizationLogoUpload.single("logo")(req,res,async error=>{
    if(!error)return next();
    if(req.file?.path){
      await fs.promises.unlink(req.file.path).catch(()=>{});
    }
    const status=error.code==="LIMIT_FILE_SIZE"?413:400;
    const message=error.code==="LIMIT_FILE_SIZE"
      ?"Organization logos must be 2 MB or smaller."
      :error.message||"Unable to upload the organization logo.";
    return res.status(status).json({message});
  });
};

const publicProfileForOwner=(profile,ownerId)=>{
  const result=publicProfileForOwner(profile,req.user.id);
  if(!result)return result;
  result.logoUrl=getPublicOrganizationLogoUrl(result.logoUrl,ownerId);
  return result;
};

const PROFILE_FORM_KEYS=[
  "headerTitle","companyName","legalName","organizationType","industry","contactPerson",
  "emailAddress","website","companyAddress","addressLine2","city","district","state","country",
  "phoneNumber1","phoneNumber2","gstin","pan","cin","tan","udyamNumber",
  "bankName","accountNo","branchName","ifsc","pinCode","stateCode",
  "billNoPrefix","billNoSequence","billNoSuffix","eWayUserName","eWayPassword"
];

const profileError=message=>{
  const error=new Error(message);
  error.status=400;
  return error;
};

const plainCustomFields=value=>{
  if(value instanceof Map||value?.$isMongooseMap===true
    ||(typeof value?.entries==="function"&&typeof value?.get==="function")){
    return Object.fromEntries(value.entries());
  }
  return value&&typeof value==="object"&&!Array.isArray(value)?{...value}:{};
};

const cleanCustomFields=(value,current={})=>{
  let parsed=value;
  if(typeof parsed==="string"){
    try{parsed=JSON.parse(parsed||"{}");}
    catch{throw profileError("Custom organization fields are not valid.");}
  }
  if(parsed===undefined)return {...current};
  if(parsed instanceof Map||parsed?.$isMongooseMap===true
    ||(typeof parsed?.entries==="function"&&typeof parsed?.get==="function")){
    parsed=Object.fromEntries(parsed.entries());
  }
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)){
    throw profileError("Custom organization fields are not valid.");
  }
  const entries=Object.entries(parsed);
  if(entries.length>100)throw profileError("An organization profile can have no more than 100 custom fields.");
  const result={...current};
  for(const [rawKey,value] of entries){
    const key=String(rawKey).trim();
    if(!key||key.length>100||["__proto__","prototype","constructor"].includes(key)){
      throw profileError("A custom organization field name is not valid.");
    }
    result[key]=value;
  }
  return result;
};

const applyProfileValues=(profile,values,customFields,fields)=>{
  for(const field of fields||[]){
    if(field?.custom||!field?.key||!PROFILE_FORM_KEYS.includes(field.key))continue;
    if(Object.prototype.hasOwnProperty.call(values,field.key)){
      profile.set(field.key,values[field.key]);
    }
  }
  for(const key of PROFILE_FORM_KEYS){
    if(Object.prototype.hasOwnProperty.call(values,key))profile.set(key,values[key]);
  }
  profile.customFields=customFields;
};


// Get profile
router.get('/', auth, async (req, res) => {
  try {
    let profile = await Profile.findOne({ createdBy: req.user.id });
    if (!profile) {
      // New accounts start with blank organization details so demo information is
      // never accidentally printed on a real customer's invoice.
      profile = await Profile.create({
        headerTitle: '',
        companyName: '',
        legalName: '',
        organizationType: '',
        industry: '',
        contactPerson: '',
        emailAddress: '',
        website: '',
        companyAddress: '',
        addressLine2: '',
        city: '',
        district: '',
        state: '',
        country: 'India',
        phoneNumber1: '',
        phoneNumber2: '',
        gstin: '',
        pan: '',
        cin: '',
        tan: '',
        udyamNumber: '',
        bankName: '',
        accountNo: '',
        branchName: '',
        ifsc: '',
        pinCode: null,
        stateCode: null,
        billNoPrefix: 'INV-',
        billNoSequence: 1,
        billNoSuffix: '',
        createdBy: req.user.id,
      });
    }

    // Clean up the exact demo profile previously created by older versions.
    const isLegacyDemoProfile = profile.companyName === 'Demo Company'
      && profile.gstin === 'ssdcd'
      && profile.pan === 'sdsdc'
      && profile.bankName === 'zc'
      && profile.accountNo === 'zxc';
    if (isLegacyDemoProfile) {
      profile.headerTitle = '';
      profile.companyName = '';
      profile.companyAddress = '';
      profile.phoneNumber1 = '';
      profile.phoneNumber2 = '';
      profile.gstin = '';
      profile.pan = '';
      profile.bankName = '';
      profile.accountNo = '';
      profile.branchName = '';
      profile.ifsc = '';
      profile.pinCode = null;
      profile.stateCode = null;
      profile.billNoPrefix = 'INV-';
      profile.billNoSequence = 1;
      profile.billNoSuffix = '';
      await profile.save();
    }

    res.json(publicProfileForOwner(profile,req.user.id));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Organization logo is optional and stored separately from editable form values.
router.post("/logo",auth,receiveOrganizationLogo,async(req,res)=>{
  if(!req.file)return res.status(400).json({message:"Choose a logo image first."});
  const newLogoUrl="/uploads/organization-logos/"+req.file.filename;
  try{
    const logoBuffer=await fs.promises.readFile(req.file.path);
    if(!hasSupportedOrganizationLogoSignature(logoBuffer,path.extname(req.file.filename))){
      await fs.promises.unlink(req.file.path).catch(()=>{});
      return res.status(400).json({message:"The selected file is not a valid JPG, PNG or WebP image."});
    }
    let profile=await Profile.findOne({createdBy:String(req.user.id)});
    if(!profile){
      profile=new Profile({
        createdBy:String(req.user.id),
        billNoPrefix:"INV-",
        billNoSequence:1
      });
    }
    const previousLogoUrl=profile.logoUrl||"";
    profile.logoUrl=newLogoUrl;
    await profile.save();
    await removeOrganizationLogo(previousLogoUrl,req.user.id);
    return res.status(201).json({
      logoUrl:getPublicOrganizationLogoUrl(profile.logoUrl,req.user.id)
    });
  }catch(error){
    await removeOrganizationLogo(newLogoUrl,req.user.id);
    return res.status(error.status||500).json({message:error.message||"Unable to save the organization logo."});
  }
});

router.delete("/logo",auth,async(req,res)=>{
  try{
    const profile=await Profile.findOne({createdBy:String(req.user.id)});
    if(!profile||!profile.logoUrl)return res.json({logoUrl:""});
    const previousLogoUrl=profile.logoUrl;
    profile.logoUrl="";
    await profile.save();
    await removeOrganizationLogo(previousLogoUrl,req.user.id);
    return res.json({logoUrl:""});
  }catch(error){
    return res.status(error.status||500).json({message:error.message||"Unable to remove the organization logo."});
  }
});

// Update profile
router.put('/', auth, async (req, res) => {
  try {
    const nextBody={};
    for(const key of PROFILE_FORM_KEYS.concat("customFields")){
      if(req.body?.[key]===undefined)continue;
      if(key==="eWayPassword"&&(req.body[key]===null||String(req.body[key])===""))continue;
      nextBody[key]=req.body[key];
    }

    let profile=await Profile.findOne({createdBy:req.user.id});
    const isNewRecord=!profile;
    if(!profile){
      profile=new Profile({
        createdBy:req.user.id,
        billNoPrefix:"INV-",
        billNoSequence:1
      });
    }

    const originalValues=profile.toObject({depopulate:true});
    const originalCustomFields=plainCustomFields(profile.customFields);
    const values={...originalValues};
    PROFILE_FORM_KEYS.forEach(key=>{
      if(nextBody[key]!==undefined)values[key]=nextBody[key];
    });
    if(values.billNoSequence!==undefined&&values.billNoSequence!==null&&values.billNoSequence!==""){
      values.billNoSequence=normalizeInvoiceSequence(values.billNoSequence);
    }
    const emailAddress=String(values.emailAddress||"").trim();
    if(emailAddress&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)){
      throw profileError("Enter a valid organization email address.");
    }
    const website=String(values.website||"").trim();
    if(website){
      let parsedWebsite;
      try{
        parsedWebsite=new URL(/^https?:\/\//i.test(website)?website:`https://${website}`);
      }catch{
        throw profileError("Enter a valid organization website, such as example.com.");
      }
      if(!["http:","https:"].includes(parsedWebsite.protocol)||!parsedWebsite.hostname.includes(".")){
        throw profileError("Enter a valid organization website, such as example.com.");
      }
    }

    const configuredFields=await loadConfiguredFormFields(req.user.id,"profile.form");
    const prepared=await prepareConfiguredFormValues({
      ownerId:req.user.id,
      fields:configuredFields,
      values,
      customFields:cleanCustomFields(nextBody.customFields,originalCustomFields),
      existingValues:originalValues,
      existingCustomFields:originalCustomFields,
      isNewRecord
    });

    const nextValues={...prepared.values};
    if(nextValues.billNoSequence!==undefined&&nextValues.billNoSequence!==null&&nextValues.billNoSequence!==""){
      nextValues.billNoSequence=normalizeInvoiceSequence(nextValues.billNoSequence);
    }

    let nextCustomFields=prepared.customFields;
    if(hasConfiguredCustomCalculations(configuredFields)){
      nextCustomFields=calculateConfiguredCustomFields(
        configuredFields,
        nextValues,
        nextCustomFields
      );
    }
    const validated=validateConfiguredFormValues({
      fields:configuredFields,
      values:nextValues,
      customFields:nextCustomFields,
      existingValues:originalValues,
      existingCustomFields:originalCustomFields,
      validateAllValues:false
    });
    applyProfileValues(profile,validated.values,validated.customFields,configuredFields);
    profile.createdBy=String(req.user.id);
    await profile.save();
    res.json(publicProfileForOwner(profile,req.user.id));
  } catch (err) {
    res.status(err.status||400).json({ message: err.message });
  }
});

//update profile sequence number from order 
router.patch('/billNoSequence', auth, async (req, res) => {
  try {
    const { billNoSequence } = req.body || {};
    const sequence = normalizeInvoiceSequence(billNoSequence);
    // const profile = await Profile.findOneAndUpdate(
    //   { createdBy: req.user.id },
    //   { billNoSequence }
    // );
    const profile = await Profile.findOneAndUpdate(
      { createdBy: req.user.id },
      { $set: { billNoSequence: sequence } },
      { new: true }
    ).lean();

    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }
    res.json(publicProfileForOwner(profile,req.user.id));
  } catch (err) {
    res.status(err.status||500).json({ message: err.message });
  }
});


// Backward-compatible alias used by older clients.
router.patch('/updateBillNoSequence', auth, async (req, res) => {
  req.url = '/billNoSequence';
  const { billNoSequence } = req.body || {};
  let sequence;
  try {
    sequence = normalizeInvoiceSequence(billNoSequence);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
  try {
    const profile = await Profile.findOneAndUpdate(
      { createdBy: String(req.user.id) },
      { $set: { billNoSequence: sequence } },
      { new: true, upsert: true }
    ).lean();
    res.json(publicProfileForOwner(profile,req.user.id));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;