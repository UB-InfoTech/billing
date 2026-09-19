// const mongoose = require('mongoose');

// // Enhanced Payment Log Schema with comprehensive audit fields
// const PaymentLogSchema = new mongoose.Schema({
//   reference: { 
//     type: String, 
//     index: true,
//     trim: true,
//     maxlength: 100
//   },
//   method: { 
//     type: String, 
//     enum: ['Cash', 'Bank', 'UPI', 'Cheque'],
//     trim: true
//   },
//   totalAmount: { 
//     type: Number, 
//     min: 0,
//     max: 10000000
//   },
//   splitType: { 
//     type: String, 
//     enum: ['proportional', 'custom']
//   },
//   paymentDate: { 
//     type: Date, 
//     required: true,
//     validate: {
//       validator: function(date) {
//         const now = new Date();
//         const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
//         const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
//         return date >= oneYearAgo && date <= oneYearFromNow;
//       },
//       message: 'Payment date must be within one year range'
//     }
//   },
//   userId: { 
//     type: mongoose.Schema.Types.ObjectId, 
//     required: true,
//     ref: 'User',
//     index: true
//   },
//   allocations: [{
//     orderId: {
//       type: mongoose.Schema.Types.ObjectId,
//       required: true,
//       ref: 'Order'
//     },
//     appliedAmount: {
//       type: Number,
//       required: true,
//       min: 0
//     },
//     orderNumber: String,
//     clientName: String
//   }],
//   skippedOrders: [{
//     orderId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Order'
//     },
//     reason: {
//       type: String,
//       enum: ['fully_paid', 'invalid_amount', 'not_found'],
//       default: 'fully_paid'
//     }
//   }],
//   transactionMetadata: {
//     requestId: {
//       type: String,
//       required: true,
//       index: true
//     },
//     processingTimeMs: {
//       type: Number,
//       min: 0
//     },
//     batchSize: {
//       type: Number,
//       min: 1,
//       max: 1000
//     },
//     ipAddress: {
//       type: String,
//       validate: {
//         validator: function(ip) {
//           // Basic IP validation (supports both IPv4 and IPv6)
//           const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
//           const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
//           return ipv4Regex.test(ip) || ipv6Regex.test(ip);
//         },
//         message: 'Invalid IP address format'
//       }
//     },
//     userAgent: {
//       type: String,
//       maxlength: 500
//     }
//   },
//   status: {
//     type: String,
//     enum: ['completed', 'partially_completed', 'failed'],
//     default: 'completed'
//   },
//   errorDetails: {
//     code: String,
//     message: String,
//     recoverable: Boolean
//   }
// }, {
//   timestamps: true,
//   versionKey: false
// });

// // Indexes for performance optimization
// PaymentLogSchema.index({ reference: 1, createdAt: -1 });
// PaymentLogSchema.index({ userId: 1, createdAt: -1 });
// PaymentLogSchema.index({ 'transactionMetadata.requestId': 1 });
// PaymentLogSchema.index({ paymentDate: 1, status: 1 });

// // Static methods for analytics
// PaymentLogSchema.statics.getPaymentSummary = function(userId, startDate, endDate) {
//   return this.aggregate([
//     {
//       $match: {
//         userId: mongoose.Types.ObjectId(userId),
//         paymentDate: {
//           $gte: startDate,
//           $lte: endDate
//         },
//         status: 'completed'
//       }
//     },
//     {
//       $group: {
//         _id: '$method',
//         totalAmount: { $sum: '$totalAmount' },
//         count: { $sum: 1 },
//         avgAmount: { $avg: '$totalAmount' }
//       }
//     },
//     {
//       $sort: { totalAmount: -1 }
//     }
//   ]);
// };

// PaymentLogSchema.statics.findDuplicateReferences = function() {
//   return this.aggregate([
//     {
//       $group: {
//         _id: '$reference',
//         count: { $sum: 1 },
//         documents: { $push: '$_id' }
//       }
//     },
//     {
//       $match: { count: { $gt: 1 } }
//     }
//   ]);
// };

// // Instance methods
// PaymentLogSchema.methods.calculateEfficiency = function() {
//   const totalOrders = this.allocations.length + this.skippedOrders.length;
//   const processedOrders = this.allocations.length;
//   return totalOrders > 0 ? (processedOrders / totalOrders) * 100 : 0;
// };

// // Pre-save middleware for data validation
// PaymentLogSchema.pre('save', function(next) {
//   // Ensure updatedAt is current
//   this.updatedAt = new Date();
  
//   // Validate allocation amounts
//   const totalAllocated = this.allocations.reduce((sum, alloc) => sum + alloc.appliedAmount, 0);
//   const difference = Math.abs(this.totalAmount - totalAllocated);
  
//   if (difference > 0.01) { // Allow 1 cent tolerance
//     return next(new Error(`Total allocated amount (${totalAllocated}) must equal payment amount (${this.totalAmount})`));
//   }
  
//   next();
// });

// module.exports = mongoose.model('PaymentLog', PaymentLogSchema);
