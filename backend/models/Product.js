const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  productName: { type: String, required: true, trim: true },
  productCode: { type: String, required: true, unique: true, uppercase: true },
  description: { type: String, trim: true },
  rate: { type: Number, required: true }, // Selling price
  quantity: { type: Number, default: 0 },
  serialNumber: { type: String, unique: true, sparse: true },
  designNo: { type: String, sparse: true }, // Optional design number

  // purchaseDate: { type: Date },
  // purchasePrice: { type: Number },

  // rawMaterials: [{
  //   materialName: String,
  //   quantityRequired: Number,
  //   unit: String
  // }],

  // stock: {
  //   ready: { type: Number, default: 0 },
  //   inProgress: { type: Number, default: 0 }
  // },

  // performance: {
  //   totalOrders: { type: Number, default: 0 },
  //   returns: { type: Number, default: 0 },
  //   rating: { type: Number, min: 0, max: 5 }
  // },

  images: [String], // URLs or base64
  barcode: { type: String }, // optional, store as image URL or code string

  // createdAt: { type: Date, default: Date.now },
  // updatedAt: { type: Date, default: Date.now }
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }
},{ timestamps: true });

module.exports = mongoose.model('Product', ProductSchema);
