const express=require("express");
const axios=require("axios");
const Order=require("../models/Order2");
const Profile=require("../models/Profile");
const {generateEWayBill}=require("../services/ewaybill/ewaybillService");
const {getValidToken}=require("../utils/ewaybill/tokenManager");
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
  const orderId=req.query.orderId||null;
  const order=orderId?await Order.findOne({_id:orderId,createdBy:req.user.id}).lean():null;
  const profile=order?await profileForOrder(order):await Profile.findOne({createdBy:String(req.user.id)}).lean();
  const gstin=profile?.gstin||process.env.TAXPRO_GSTIN;
  const username=profile?.eWayUserName||process.env.TAXPRO_USERNAME;
  const ewbpwd=profile?.eWayPassword||process.env.TAXPRO_EWAY_PASSWORD;
  if(!gstin||!username||!ewbpwd)throw new Error("E-Way Bill credentials are not configured.");
  const token=await getValidToken({gstin,eWayUserName:username,eWayPassword:ewbpwd});
  const ewbNo=req.params.ewbNo;
  const base=process.env.TAXPRO_BASE_URL||"https://gstsandbox.charteredinfo.com";
  const data=await axios.get(base+"/ewaybillapi/dec/v1.03/ewayapi?action=GetEwayBill&authtoken="+encodeURIComponent(token)+"&gstin="+encodeURIComponent(gstin)+"&password="+encodeURIComponent(password)+"&aspid="+encodeURIComponent(aspid)+"&ewbNo="+encodeURIComponent(ewbNo),{timeout:30000});
  const pdf=await axios.post(printUrl+"?showdemo&aspid="+encodeURIComponent(aspid)+"&password="+encodeURIComponent(password)+"&gstin="+encodeURIComponent(gstin),data.data,{responseType:"arraybuffer",timeout:30000});
  res.setHeader("Content-Type","application/pdf");res.setHeader("Content-Disposition",'attachment; filename="ewaybill_'+ewbNo+'.pdf"');res.send(pdf.data);
}

router.get("/pdf/:ewbNo",auth,async(req,res)=>{try{await sendPdf(req,res);}catch(error){res.status(400).json({message:error.message});}});
router.get("/pdf/:ewbNo/:gstin/:username/:ewbpwd",auth,async(req,res)=>{try{await sendPdf(req,res);}catch(error){res.status(400).json({message:error.message});}});
module.exports=router;