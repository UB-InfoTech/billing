const axios=require("axios");
const Order=require("../../models/Order2");
const Profile=require("../../models/Profile");
const {getValidToken}=require("../../utils/ewaybill/tokenManager");
const {buildEwaybillPayload}=require("./payloadBuilder");
const {aspid,password,baseUrl}=require("../../config/ewaybillConfig");

async function generateEWayBill(body){
  const order=await Order.findOne({_id:body.orderId,createdBy:body.createdBy||undefined});
  if(!order)throw new Error("Order not found.");
  const profile=await Profile.findOne({createdBy:String(order.createdBy)}).lean();
  if(!profile)throw new Error("Company profile not found.");
  const eWayUserName=profile.eWayUserName||process.env.TAXPRO_USERNAME;
  const eWayPassword=profile.eWayPassword||process.env.TAXPRO_EWAY_PASSWORD;
  const eWayProfile={...profile,eWayUserName,eWayPassword,gstin:profile.gstin||process.env.TAXPRO_GSTIN};
  const payload=buildEwaybillPayload(order,body,eWayProfile);
  const token=await getValidToken(eWayProfile);

  if(!aspid||!password)throw new Error("TaxPro ASP credentials are not configured.");
  const response=await axios.post(
    baseUrl+"/ewaybillapi/dec/v1.03/ewayapi?action=GENEWAYBILL",
    payload,
    {headers:{"Content-Type":"application/json",aspid,password,gstin:eWayProfile.gstin,username:eWayProfile.eWayUserName,authtoken:token},timeout:30000}
  );

  const data=response.data||{};
  const ewayBillNo=data.ewayBillNo||data.EwayBillNo||data.ewayBillNumber;
  if(!ewayBillNo)throw new Error(data?.error?.message||data?.message||"E-Way Bill was not generated.");

  order.ewbDetails={ewbNo:String(ewayBillNo),ewbDate:data.ewayBillDate||"",validTill:data.validUpto||data.validTill||"",status:"Generated",alert:data.alert||""};
  await order.save();
  return data;
}

module.exports={generateEWayBill};