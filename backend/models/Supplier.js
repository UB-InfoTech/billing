const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
    name: { type: String },
    gstin: { type: String, unique: true },
    contact: {
      email: { type: String },
      phone: { type: String },
    },
    reliability_score: { type: Number, default: 100 },
  });
  
  module.exports = mongoose.model('Supplier', supplierSchema);
  