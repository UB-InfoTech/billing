const express=require("express");
const mongoose=require("mongoose");
const axios=require("axios");
const Order=require("../models/Order2");
const Profile=require("../models/Profile");
const {generateEWayBill}=require("../services/ewaybill/ewaybillService");
const {getValidToken}=require("../utils/ewaybill/tokenManager");
const {validateRequestedEwayBill}=require("../utils/ewaybill/pdfAccess");
const {aspid,password,printUrl}=require("../config/ewaybillConfig");
const auth=require("../middleware/auth");
const router=express.Router();

async function profileForOrder(order){
  const profile=await Profile.findOne({createdBy:String(order.createdBy)}).lean();
  if(!profile)throw new Error("Company profile not found.");
  return {...profile,gstin:profile.gstin||process.env.TAXPRO_GSTIN,eWayUserName:profile.eWayUserName||process.env.TAXPRO_USERNAME,eWayPassword:profile.eWayPassword||process.env.TAXPRO_EWAY_PASSWORD};
}

router.post("/generate/:orderId",auth,async(req,res)=>{
  try{
    const result=await generateEWayBill({...req.body,orderId:req.params.orderId,createdBy:req.user.id});
    res.json({success:true,data:result});
  }catch(error){res.status(400).json({success:false,message:error.message,error:error.message});}
});

async function sendPdf(req,res){
  const orderId=String(req.query.orderId||"").trim();
  if(!mongoose.isValidObjectId(orderId)){
    const error=new Error("Choose the invoice that owns this E-Way Bill.");
    error.status=400;
    throw error;
  }

  const order=await Order.findOne({_id:orderId,createdBy:req.user.id}).lean();
  if(!order){
    const error=new Error("The selected invoice was not found in your account.");
    error.status=404;
    throw error;
  }

  const requestedEwbNo=validateRequestedEwayBill(order,req.params.ewbNo);

  const profile=await profileForOrder(order);
  const gstin=profile.gstin;
  const username=profile.eWayUserName;
  const ewbpwd=profile.eWayPassword;
  if(!gstin||!username||!ewbpwd)throw new Error("E-Way Bill credentials are not configured.");

  const token=await getValidToken({gstin,eWayUserName:username,eWayPassword:ewbpwd});
  const ewbNo=requestedEwbNo;
  const base=process.env.TAXPRO_BASE_URL||"https://gstsandbox.charteredinfo.com";
  const data=await axios.get(
    base+"/ewaybillapi/dec/v1.03/ewayapi?action=GetEwayBill&authtoken="+encodeURIComponent(token)+
    "&gstin="+encodeURIComponent(gstin)+"&password="+encodeURIComponent(password)+
    "&aspid="+encodeURIComponent(aspid)+"&ewbNo="+encodeURIComponent(ewbNo),
    {timeout:30000}
  );
  const pdf=await axios.post(
    printUrl+"?showdemo&aspid="+encodeURIComponent(aspid)+"&password="+encodeURIComponent(password)+
    "&gstin="+encodeURIComponent(gstin),
    data.data,
    {responseType:"arraybuffer",timeout:30000}
  );
  res.setHeader("Content-Type","application/pdf");
  res.setHeader("Content-Disposition",'attachment; filename="ewaybill_'+ewbNo+'.pdf"');
  res.setHeader("Cache-Control","no-store");
  return res.send(pdf.data);
}

router.get("/pdf/:ewbNo",auth,async(req,res)=>{try{await sendPdf(req,res);}catch(error){res.status(error.status||502).json({message:error.message||"Unable to download the E-Way Bill PDF."});}});
module.exports=router;