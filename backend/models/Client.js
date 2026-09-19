const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema({

  // Personal Details
  name: { type: String },
  email: { type: String },
  phone: { type: String },
  address: { type: String },
  state: { type: String },
  city: { type: String },
  pinCode: { type: String },
  stateCode: { type: String }, // e.g., '01' for Andhra Pradesh
  
  // Business Details
  gstNumber: { type: String },
  companyName: { type: String },
  businessType: { type: String, enum: ['Retail', 'Wholesale', 'Manufacturer', 'Trader','Supplier','Other'] },
  // creditLimit: { type: Number, default: 0 },

  // Transaction & Order History
  orderCount: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  lastOrderDate: { type: Date, default: null },
  totalPaid: { type: Number, default: 0 },
  payments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
  
  // Order & Payment Insights
  pendingPayments: { type: Number, default: 0 },
  paymentTerms: { type: String, enum: ['30', '60', '90' , 'Advance'], default: '30' },
  // loyaltyPoints: { type: Number, default: 0 },
  discountRate: { type: Number, default: 0 },
  
  // Automation & AI-driven Analytics
  averageOrderValue: { type: Number, default: 0 },
  preferredProducts: [{ type: String }],
  // orderFrequency: { type: String, enum: ['Daily', 'Weekly', 'Monthly', 'Occasional'], default: 'Occasional' },

  // Additional Fields
  accountStatus: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  notes: { type: String },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Client', ClientSchema);