//using
const axios = require('axios');
const { getValidToken } = require('../utils/ewaybill/tokenManager');
const { aspid, password, username, gstin, ewbpwd } = require('../config/ewaybillConfig');

const getGstDetails = async (gstNumber) => {
    if (!gstNumber) throw new Error('GST Number is required');

    const profile = {
        gstin: gstin,
        eWayUserName: username,
        eWayPassword: ewbpwd
    };
    
    const token = await getValidToken(profile);
    //in live version profile is not send ${profile.gstin}, directly {gstin} is send
    const url = `https://gstsandbox.charteredinfo.com/ewaybillapi/dec/v1.03/Master?action=GetGSTINDetails&aspid=${aspid}&password=${password}&gstin=${profile.gstin}&username=${profile.eWayUserName}&authtoken=${token}&SearchGSTIN=${gstNumber}`;
     try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error('Error fetching GST details:', error);
        throw new Error('Failed to fetch GST details');
    }
}
module.exports = { getGstDetails };
