const express=require("express");
const Profile=require("../models/Profile");
const auth=require("../middleware/auth");
const {getGstDetails}=require("../services/gstGstDetails");
const router=express.Router();

router.get("/:gstNumber",auth,async(req,res)=>{
  try{
    const profile=await Profile.findOne({createdBy:String(req.user.id)}).lean();
    if(!profile)return res.status(404).json({success:false,message:"Company profile not found."});
    const data=await getGstDetails(req.params.gstNumber,{...profile,eWayUserName:profile.eWayUserName||process.env.TAXPRO_USERNAME,eWayPassword:profile.eWayPassword||process.env.TAXPRO_EWAY_PASSWORD,gstin:profile.gstin||process.env.TAXPRO_GSTIN});
    res.json({success:true,data});
  }catch(error){res.status(400).json({success:false,message:error.message});}
});
module.exports=router;