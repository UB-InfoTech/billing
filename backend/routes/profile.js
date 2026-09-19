const express = require('express');
const router = express.Router();
const Profile = require('../models/Profile');
const auth = require('../middleware/auth');

// Get profile
router.get('/', auth, async (req, res) => {
  try {
    let profile = await Profile.findOne({ createdBy: req.user.id });
    if (!profile) {
      // Create a default profile if none exists
      profile = await Profile.create({
        headerTitle: 'Default Company Profile',
        companyName: 'Demo Company',
        companyAddress: 'demo address',
        phoneNumber1: '1234567890',
        phoneNumber2: '9876543210',
        gstin: 'ssdcd',
        pan: 'sdsdc',
        bankName: 'zc',
        accountNo: 'zxc',
        branchName: 'zsc',
        ifsc: '64',
        pinCode: 0,
        stateCode: 24,
        billNoPrefix: '',
        billNoSequence: 1,
        billNoSuffix: '',
        createdBy: req.user.id, // Assuming req.user is set by auth middleware
      });
    }
    res.json(profile);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update profile
router.put('/', auth, async (req, res) => {
  try {
    const profile = await Profile.findOneAndUpdate({ createdBy: req.user.id }, req.body, {
      new: true,
      upsert: true, // Creates a document if none exists
    });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

//update profile sequence number from order 
router.patch('/billNoSequence', auth, async (req, res) => {
  try {
    const { billNoSequence } = req.body;
    if (typeof billNoSequence !== 'number' || billNoSequence < 0) {
      return res.status(400).json({ message: 'billNoSequence must be a non-negative number' });
    }
    // const profile = await Profile.findOneAndUpdate(
    //   { createdBy: req.user.id },
    //   { billNoSequence }
    // );
    const profile = await Profile.findOneAndUpdate(
      { createdBy: req.user.id },
      { $set: { billNoSequence } },
      { new: true }
    ).lean();

    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }
    res.json(profile);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


module.exports = router;