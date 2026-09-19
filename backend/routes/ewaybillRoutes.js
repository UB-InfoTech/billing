//using
const express = require('express');
const router = express.Router();
const { generateEWayBill } = require('../services/ewaybill/ewaybillService');
const { getValidToken } = require('../utils/ewaybill/tokenManager');
// const { aspid, password, gstin, username, ewbpwd } = require('../config/ewaybillConfig');
const { aspid, password } = require('../config/ewaybillConfig');

const axios = require('axios');
const auth = require('../middleware/auth');

//  const profile = {
//         gstin: gstin,
//         eWayUserName: username,
//         eWayPassword: ewbpwd
//     };

router.post('/generate/:orderId', auth, async (req, res) => {
  try {
  
    // const result = await generateEWayBill({ ...req.body, orderId: req.params.orderId, eWayUserName, eWayPassword });
    // const result = await ({ ...req.body, orderId: req.params.orderId, eWayUserName, eWayPassword, userRecord });
    // const result = await generateEWayBill({ ...req.body, orderId: req.params.orderId, eWayUserName, eWayPassword, userRecord });
    const result = await generateEWayBill({ ...req.body, orderId: req.params.orderId });

    if (!result) {
      return res.status(404).json({ success: false, message: 'EWayBill generation failed' });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error("err message from route :", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

//generate ewaybill pdf
router.get('/pdf/:ewbNo/:gstin/:username/:ewbpwd', async (req, res) => {
  console.log("params in ewaybill pdf route :", req.params);
  // const { ewbNo,  } = req.params;
  const { ewbNo, gstin, username, ewbpwd } = req.params;
  const profile = {
    gstin: gstin,
    eWayUserName: username,
    eWayPassword: ewbpwd
  };
  try {
    const token = await getValidToken(profile);
    console.log("token in ewaybill pdf route :", token);
    
    // `https://einvapi.charteredinfo.com/v1.03/dec/ewayapi?action=GetEwayBill&authtoken=${token}&gstin=${gstin}&password=${password}&aspid=${aspid}&ewbNo=${ewbNo}`,
    const eWayData = await axios.get(
      `https://gstsandbox.charteredinfo.com/ewaybillapi/dec/v1.03/ewayapi?action=GetEwayBill&authtoken=${token}&gstin=${gstin}&password=${password}&aspid=${aspid}&ewbNo=${ewbNo}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    console.log("eWayData in ewaybill pdf route :", eWayData.data);
    // `https://einvapi.charteredinfo.com/aspapi/v1.0/printewb?aspid=${aspid}&password=${password}&gstin=${gstin}`,
    const pdfRes = await axios.post(
      `https://einvapi.charteredinfo.com/aspapi/v1.0/printewb?showdemo&aspid=${aspid}&password=${password}&gstin=${gstin}`,
      eWayData.data,
      { responseType: 'arraybuffer' } // Ensure response is in arraybuffer(binary) format for PDF
    );

    // // 🔽 This will send the file to browser for download

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=ewaybill_${ewbNo}.pdf`
    );

    res.send(pdfRes.data); // Send PDF as response
  } catch (err) {
    console.error('EWB PDF Error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to download PDF' });
  }
});

// router.get('/token', async (req, res) => {
//   try {
//     const token = await getValidToken(profile);
//     res.json({ success: true, token });
//   } catch (err) {
//     console.error('Error fetching token:', err);
//     res.status(500).json({ success: false, error: err.message });
//   }
// });


module.exports = router;