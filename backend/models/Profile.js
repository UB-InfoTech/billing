const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  headerTitle: { type: String },
  companyName: { type: String },
  companyAddress: { type: String },
  phoneNumber1: { type: String },
  phoneNumber2: { type: String },
  gstin: { type: String },
  pan: { type: String },
  bankName: { type: String },
  accountNo: { type: String },
  branchName: { type: String },
  ifsc: { type: String },
  pinCode: { type: Number },
  stateCode: { type: Number },
  billNoPrefix: { type: String },
  billNoSequence: { type: Number },
  billNoSuffix: { type: String },
  createdBy: { type: String, required: true },
  eWayUserName: { type: String },
  eWayPassword: { type: String },
});

module.exports = mongoose.model('Profile', profileSchema);