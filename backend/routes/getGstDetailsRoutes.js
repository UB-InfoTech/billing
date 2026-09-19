//using
const express = require('express');
const router = express.Router();
const { getGstDetails } = require('../services/gstGstDetails');

router.get('/:gstNumber', async (req, res) => {
  try {
    const gstNumber = req.params.gstNumber;    
    const gstDetails = await getGstDetails(gstNumber);

    if (!gstDetails) {
      return res.status(404).json({ success: false, message: 'GST details not found' });
    }
    
    res.json({ success: true, data: gstDetails });
  } catch (err) {
    console.error('Error fetching GST details:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
module.exports = router;