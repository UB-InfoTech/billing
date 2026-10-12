const express = require('express');
const router = express.Router();
const Profile = require('../models/Profile');
const auth = require('../middleware/auth');
const {toPublicProfile}=require('../utils/publicProfile');

// Get profile
router.get('/', auth, async (req, res) => {
  try {
    let profile = await Profile.findOne({ createdBy: req.user.id });
    if (!profile) {
      // New accounts start with blank company details so demo information is
      // never accidentally printed on a real customer's invoice.
      profile = await Profile.create({
        headerTitle: '',
        companyName: '',
        companyAddress: '',
        phoneNumber1: '',
        phoneNumber2: '',
        gstin: '',
        pan: '',
        bankName: '',
        accountNo: '',
        branchName: '',
        ifsc: '',
        pinCode: null,
        stateCode: null,
        billNoPrefix: 'INV-',
        billNoSequence: 1,
        billNoSuffix: '',
        createdBy: req.user.id,
      });
    }

    // Clean up the exact demo profile previously created by older versions.
    const isLegacyDemoProfile = profile.companyName === 'Demo Company'
      && profile.gstin === 'ssdcd'
      && profile.pan === 'sdsdc'
      && profile.bankName === 'zc'
      && profile.accountNo === 'zxc';
    if (isLegacyDemoProfile) {
      profile.headerTitle = '';
      profile.companyName = '';
      profile.companyAddress = '';
      profile.phoneNumber1 = '';
      profile.phoneNumber2 = '';
      profile.gstin = '';
      profile.pan = '';
      profile.bankName = '';
      profile.accountNo = '';
      profile.branchName = '';
      profile.ifsc = '';
      profile.pinCode = null;
      profile.stateCode = null;
      profile.billNoPrefix = 'INV-';
      profile.billNoSequence = 1;
      profile.billNoSuffix = '';
      await profile.save();
    }

    res.json(toPublicProfile(profile));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update profile
router.put('/', auth, async (req, res) => {
  try {
    const allowedFields=[
      "headerTitle","companyName","companyAddress","phoneNumber1","phoneNumber2",
      "gstin","pan","bankName","accountNo","branchName","ifsc","pinCode","stateCode",
      "billNoPrefix","billNoSequence","billNoSuffix","eWayUserName","eWayPassword","customFields"
    ];
    const nextBody={};
    for(const key of allowedFields){
      if(req.body?.[key]===undefined)continue;
      // An empty password means "leave the saved integration password alone".
      // The password itself is never sent back in profile API responses.
      if(key==="eWayPassword"&&(req.body[key]===null||String(req.body[key])===""))continue;
      nextBody[key]=req.body[key];
    }
    if(nextBody.billNoSequence!==undefined){
      const sequence=Number(nextBody.billNoSequence);
      if(!Number.isSafeInteger(sequence)||sequence<0){
        return res.status(400).json({message:"Invoice number sequence must be a whole number of zero or more."});
      }
      nextBody.billNoSequence=sequence;
    }
    if(nextBody.customFields&&typeof nextBody.customFields==="object"&&!Array.isArray(nextBody.customFields)){
      nextBody.customFields=Object.fromEntries(
        Object.entries(nextBody.customFields).slice(0,100).map(([key,value])=>[String(key).slice(0,100),value])
      );
    }else{
      delete nextBody.customFields;
    }

    const profile = await Profile.findOneAndUpdate(
      { createdBy: req.user.id },
      {$set:nextBody},
      {new:true,upsert:true,setDefaultsOnInsert:true,runValidators:true}
    ).lean();
    res.json(toPublicProfile(profile));
  } catch (err) {
    res.status(400).json({ message: err.message });
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
    res.json(toPublicProfile(profile));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// Backward-compatible alias used by older clients.
router.patch('/updateBillNoSequence', auth, async (req, res) => {
  req.url = '/billNoSequence';
  const { billNoSequence } = req.body || {};
  if (!Number.isFinite(Number(billNoSequence)) || Number(billNoSequence) < 0) {
    return res.status(400).json({ message: 'billNoSequence must be a non-negative number' });
  }
  try {
    const profile = await Profile.findOneAndUpdate(
      { createdBy: String(req.user.id) },
      { $set: { billNoSequence: Number(billNoSequence) } },
      { new: true, upsert: true }
    ).lean();
    res.json(toPublicProfile(profile));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;