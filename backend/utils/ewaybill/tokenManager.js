const axios=require("axios");
const EwayAuthToken=require("../../models/EwayAuthToken");
const {aspid,password}=require("../../config/ewaybillConfig");

function ttlMinutes(){
  const value=Number(process.env.EWAY_TOKEN_TTL_MINUTES||330);
  return Number.isFinite(value)&&value>1?Math.min(value,360):330;
}

async function getNewToken(gstin,eWayUserName,eWayPassword){
  if(!aspid||!password)throw new Error("E-Way Bill ASP credentials are not configured.");
  if(!gstin||!eWayUserName||!eWayUserName||!eWayPassword)throw new Error("GSTIN, E-Way username and password are required.");

  const response=await axios.get(
    "https://gstsandbox.charteredinfo.com/ewaybillapi/dec/v1.03/auth",
    {headers:{
      "Content-Type":"application/json",
      action:"ACCESSTOKEN",
      aspid,password,gstin,username:eWayUserName,ewbpwd:eWayPassword
    },timeout:15000}
  );

  const AuthToken=response.data?.authtoken;
  if(!AuthToken)throw new Error(response.data?.error?.message||"TaxPro authentication did not return a token.");

  const expiry=new Date(Date.now()+ttlMinutes()*60*1000);
  await EwayAuthToken.deleteMany({createdBy:String(gstin)});
  await EwayAuthToken.create({token:AuthToken,tokenExp:expiry,createdBy:String(gstin)});
  return AuthToken;
}

async function getValidToken(profile){
  if(!profile?.gstin||!profile?.eWayUserName||!profile?.eWayPassword)throw new Error("GSTIN, e-Way username and password are required.");
  const existing=await EwayAuthToken.findOne({createdBy:String(profile.gstin)}).sort({tokenExp:-1}).lean();
  if(existing?.token&&existing.tokenExp&&new Date(existing.tokenExp).getTime()>Date.now()+30000)return existing.token;
  return getNewToken(profile.gstin,profile.eWayUserName,profile.eWayPassword);
}

module.exports={getValidToken,getNewToken};