const axios=require("axios");
const {getValidToken}=require("../utils/ewaybill/tokenManager");
const {aspid,password}=require("../config/ewaybillConfig");

async function getGstDetails(gstNumber,profile){
  const searchGSTIN=String(gstNumber||"").trim().toUpperCase();
  if(!/^[0-9A-Z]{15}$/.test(searchGSTIN))throw new Error("A valid 15-character GSTIN is required.");
  const gstin=profile?.gstin||process.env.TAXPRO_GSTIN;
  const username=profile?.eWayUserName||process.env.TAXPRO_USERNAME;
  const ewbpwd=profile?.eWayPassword||process.env.TAXPRO_EWAY_PASSWORD;
  if(!gstin||!username||!ewbpwd||!aspid||!password)throw new Error("TaxPro GST lookup credentials are not configured.");
  const token=await getValidToken({gstin,eWayUserName:username,eWayPassword:ewbpwd});
  const url=(process.env.TAXPRO_BASE_URL||"https://gstsandbox.charteredinfo.com")+"/ewaybillapi/dec/v1.03/Master";
  const response=await axios.get(url,{params:{action:"GetGSTINDetails",aspid,password,gstin,username,authtoken:token,SearchGSTIN:searchGSTIN},timeout:15000});
  return response.data;
}
module.exports={getGstDetails};