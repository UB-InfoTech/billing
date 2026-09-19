// using
const axios = require('axios');
const Order = require('../../models/Order2');
const Profile = require('../../models/Profile');
// const { getAuthToken } = require('../ewaybillAuthService');
const { getValidToken } = require('../../utils/ewaybill/tokenManager');
const { buildEwaybillPayload } = require('./payloadBuilder');
const { aspid, password, username, gstin } = require('../../config/ewaybillConfig');
// const { aspid, gstin } = require('../../config/ewaybillConfig');
// eWayPassword
// eWayUserName

// const generateEWayBill = async (body, orderId, eWayUserName, eWayPassword, userRecord) => {
const generateEWayBill = async (body, orderId) => {
    const order = await Order.findById(body.orderId || orderId);
    const profile = await Profile.findOne({ createdBy: order.createdBy });

    if (!order) throw new Error('Order not found');
    if (!order.gstNumber) throw new Error('Client GST not available');

    const payload = buildEwaybillPayload(order, body, profile);

    const token = await getValidToken(profile);

    
    // //     'Content-Type': 'text/plain',
    // // const url = `https://gstsandbox.charteredinfo.com/ewaybillapi/dec/v1.03/ewayapi?action=GENEWAYBILL&aspid=${aspid}&password=${password}&gstin=${gstin}&username=${username}&authtoken=${token}`;
    // // const url = `https://gstsandbox.charteredinfo.com/ewaybillapi/dec/v1.03/ewayapi?action=GENEWAYBILL&aspid=1783712425&password=MakeMoney123@@&gstin=34AACCC1596Q002&username=TaxProEnvPON&authtoken=1g59Bm9i5Kr7sIJJ1woi7lcpX`;
    // // const response = await axios.post(url, payload);

    try {
        // // "https://einvapi.charteredinfo.com/v1.03/dec/ewayapi?action=GENEWAYBILL",
        
        const response = await axios.post(
            "https://gstsandbox.charteredinfo.com/ewaybillapi/dec/v1.03/ewayapi?action=GENEWAYBILL",
            payload
            , {
                headers: {
                    'Content-Type': 'application/json',
                    'aspid': aspid,
                    'username': profile.eWayUserName,
                    'password': password,
                    'authtoken': token,
                    'gstin': profile.gstin,
                },
            }
        );
        const { ewayBillNo, ewayBillDate, validUpto, alert } = response.data;

        order.ewbDetails = {
            ewbNo: ewayBillNo,
            ewbDate: ewayBillDate,
            validTill: validUpto,
            status: 'Generated',
            alert: alert,
        };

        await order.save();
        return response.data;
    } catch (err) {
        throw new Error('Failed to generate e-Way Bill - ' + (err.response.data.error.message || err.message));
    }
};

module.exports = { generateEWayBill };
