const mongoose = require('mongoose');

const MachineSchema = new mongoose.Schema({
    name: { type: String, required: true },
    totalOrdersProcessed: { type: Number, default: 0 },
    totalRevenueGenerated: { type: Number, default: 0 },
    downtimeHours: { type: Number, default: 0 }, // To track maintenance issues
  });

  
  module.exports = mongoose.model('Machine', MachineSchema);