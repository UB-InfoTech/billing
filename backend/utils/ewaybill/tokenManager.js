// using
const axios = require('axios');
const EwayAuthToken = require('../../models/EwayAuthToken');
// const { aspid, password, gstin, username, ewbpwd } = require('../../config/ewaybillConfig');
const { aspid, password } = require('../../config/ewaybillConfig');

const getNewToken = async (gstin, eWayUserName, eWayPassword) => {


  // --------------------
  // for eInvoice bill API or IRN api
  // const headers = {
  //   'aspid': aspid,
  //   'password': password,
  //   'Gstin': gstin,
  //   'user_name': username,
  //   'eInvPwd': eInvPwd,
  // };

  // const response = await axios.get(
  //   'https://gstsandbox.charteredinfo.com/eivital/dec/v1.04/auth',
  //   {
  //     headers
  //   }
  // );
  // -------------------------


  // ---------------------
  // for simple eWay bill API

  const headers = {
    'Content-Type': 'application/json',
    'action': 'ACCESSTOKEN',
    'aspid': aspid,
    'password': password,
    'gstin': gstin,
    'username': eWayUserName,
    'ewbpwd': eWayPassword,
  };

  console.log("headers for token request :", headers);

  // 'https://einvapi.charteredinfo.com/v1.03/dec/auth',
  const response = await axios.get(
    'https://gstsandbox.charteredinfo.com/ewaybillapi/dec/v1.03/auth',
    {
      headers
    }
  );

   // const { AuthToken, TokenExpiry } = response.data.Data; // use response.data.Data when eInvoice bill API or IRN api is used
  const AuthToken = response.data.authtoken; // use response.authtoken when simple eWay bill API is used


  // for production 6hrs and for testing 1hrs
  // const expiry = new Date(Date.now() + 360 * 60 * 1000); // 360 mins = 6 hours 
  // const expiry = new Date(Date.now() + 55 * 60 * 1000); // 55 mins = 55 minutes
  const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

  // 
  // await EwayAuthToken.deleteMany(); // Clean old tokens
  // await new EwayAuthToken({ token: AuthToken, tokenExp: expiry }).save();
  await EwayAuthToken.deleteMany({ createdBy: gstin }); // Clean old tokens for specific user
  await new EwayAuthToken({ token: AuthToken, tokenExp: expiry, createdBy: gstin }).save();
  
  return AuthToken;
  // return headers;
};

const getValidToken = async (profile) => {
  console.log("profile in getValidToken :", profile);
  // profile = { gstin, eWayUserName, eWayPassword }
  if (!profile.gstin || !profile.eWayUserName || !profile.eWayPassword) {
    throw new Error('GSTIN, eWayUserName, and eWayPassword are required to get token');
  }
  // const existing = await EwayAuthToken.findOne({ createdBy: profile.gstin });
// find the existing token for the specific user by gstin
  const existing = await EwayAuthToken.findOne({ createdBy: profile.gstin });
  console.log("existing old token from db :", existing);

  // if (!existing || new Date() > existing.tokenExp) {
  if (new Date() > existing.tokenExp) {
    return await getNewToken(profile.gstin, profile.eWayUserName, profile.eWayPassword);
  }
  // return await getNewToken(profile.gstin, profile.eWayUserName, profile.eWayPassword);
 return existing.token;
// return "1uIKT54h5Kag7if4zYJLpJ1VU";
};

module.exports = { getValidToken };
