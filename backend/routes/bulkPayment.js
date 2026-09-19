// const express = require('express');
// const mongoose = require('mongoose');
// const rateLimit = require('express-rate-limit');
// const mongoSanitize = require('express-mongo-sanitize');
// const jwt = require('jsonwebtoken');
// const { body, validationResult } = require('express-validator');
// const { v4: uuidv4 } = require('uuid');

// const Order = require('../models/Order'); // Assuming Order model exists
// const PaymentLog = require('../models/PaymentLog');
// const auth = require('../middleware/auth');

// const router = express.Router();

// // Configuration from environment variables
// const config = {
//   maxTransactionTimeMs: parseInt(process.env.MAX_TRANSACTION_TIME) || 30000,
//   maxBatchSize: parseInt(process.env.MAX_BATCH_SIZE) || 1000,
//   jwtSecret: process.env.JWT_SECRET || 'fallback_secret_change_in_production',
//   mongoUri: process.env.MONGODB_URI,
//   rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
//   rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 10
// };

// // Utility functions for decimal precision
// const roundToDecimal = (num, decimals = 2) => {
//   return Math.round((num + Number.EPSILON) * Math.pow(10, decimals)) / Math.pow(10, decimals);
// };

// const parseDecimal = (value, decimals = 2) => {
//   const num = parseFloat(value) || 0;
//   return roundToDecimal(num, decimals);
// };

// // Enhanced proportional allocation with precision handling
// const calculateProportionalAllocation = (orders, totalAmount) => {
//   const totalDue = orders.reduce((sum, order) => sum + order.dueAmount, 0);

//   if (totalDue === 0) return orders.map(order => ({ ...order, allocated: 0 }));

//   let allocations = orders.map(order => ({
//     ...order,
//     allocated: parseDecimal((order.dueAmount / totalDue) * totalAmount)
//   }));

//   // Handle rounding differences
//   const currentTotal = allocations.reduce((sum, item) => sum + item.allocated, 0);
//   const difference = parseDecimal(totalAmount - currentTotal);

//   if (Math.abs(difference) > 0.01) {
//     const maxDueIndex = allocations.reduce((maxIdx, item, idx) => 
//       item.dueAmount > allocations[maxIdx].dueAmount ? idx : maxIdx, 0);

//     allocations[maxDueIndex].allocated = parseDecimal(
//       allocations[maxDueIndex].allocated + difference
//     );
//   }

//   return allocations;
// };

// // Rate limiting middleware
// const paymentLimiter = rateLimit({
//   windowMs: config.rateLimitWindow,
//   max: config.rateLimitMax,
//   message: {
//     message: 'Too many payment requests. Please try again later.',
//     code: 'RATE_LIMIT_EXCEEDED',
//     retryAfter: Math.ceil(config.rateLimitWindow / 1000)
//   },
//   standardHeaders: true,
//   legacyHeaders: false,
//   keyGenerator: (req) => {
//     return req.user?.id || req.ip; // Rate limit by user ID or IP
//   }
// });

// // Input validation middleware
// const validatePaymentInput = [
//   body('method')
//     .isIn(['Cash', 'Bank', 'UPI', 'Cheque'])
//     .withMessage('Invalid payment method'),

//   body('amountReference')
//     .isString()
//     .trim()
//     .isLength({ min: 1, max: 100 })
//     .matches(/^[a-zA-Z0-9\-_\s]+$/)
//     .withMessage('Invalid amount reference format'),

//   body('amount')
//     .isFloat({ min: 0.01, max: 10000000 })
//     .withMessage('Amount must be between 0.01 and 10,000,000'),

//   body('paymentDate')
//     .isISO8601()
//     .custom((value) => {
//       const date = new Date(value);
//       const now = new Date();
//       const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
//       const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

//       if (date < oneYearAgo || date > oneYearFromNow) {
//         throw new Error('Payment date must be within one year range');
//       }
//       return true;
//     }),

//   body('splitType')
//     .isIn(['proportional', 'custom'])
//     .withMessage('Invalid split type'),

//   body('updates')
//     .isArray({ min: 1, max: config.maxBatchSize })
//     .withMessage(`Updates array must contain 1-${config.maxBatchSize} items`),

//   body('updates.*.orderId')
//     .optional()
//     .isMongoId()
//     .withMessage('Invalid order ID format'),

//   body('updates.*.amount')
//     .optional()
//     .isFloat({ min: 0 })
//     .withMessage('Custom amount must be non-negative')
// ];

// // Request ID middleware
// router.use(auth, (req, res, next) => {
//   req.id = uuidv4();
//   req.startTime = Date.now();

//   // Log incoming request
//   console.log('Incoming payment request:', {
//     requestId: req.id,
//     userId: req.user?.id,
//     ip: req.ip,
//     userAgent: req.get('User-Agent'),
//     timestamp: new Date().toISOString()
//   });

//   next();
// });

// // Apply sanitization
// router.use(mongoSanitize());

// // Main bulk payment route
// router.put('/orders/payments/bulk', 
//   paymentLimiter,
//   auth,
//   validatePaymentInput,
//   async (req, res) => {
//     // Check validation results
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({
//         message: 'Validation failed',
//         code: 'VALIDATION_ERROR',
//         errors: errors.array(),
//         requestId: req.id
//       });
//     }

//     const session = await mongoose.startSession();
//     let paymentLog = null;
//     const processingStartTime = Date.now();

//     try {
//       // Start transaction with timeout and proper options
//       session.startTransaction({
//         readConcern: { level: "snapshot" },
//         writeConcern: { w: "majority", j: true },
//         maxTimeMS: config.maxTransactionTimeMs
//       });

//       const { method, amountReference, amount, splitType, updates, paymentDate } = req.body;
//       const sanitizedAmount = parseDecimal(amount);

//       // Enhanced duplicate check with user context
//       const duplicateCheck = await Order.findOne(
//         { 
//           "payments.amountReference": amountReference,
//           // Optional: Add user-specific duplicate checking
//           userId: req.user.id 
//         },
//         null,
//         { session }
//       );

//       if (duplicateCheck) {
//         throw new Error(`Duplicate payment reference: ${amountReference}. Please use a unique reference.`);
//       }

//       // Fetch and validate orders
//       const orderIds = updates.map(u => typeof u === "string" ? u : u.orderId);
//       const orders = await Order.find({ 
//         _id: { $in: orderIds },
//         // Optional: Add user ownership check
//         userId: req.user.id
//       }).session(session);

//       if (orders.length === 0) {
//         throw new Error("No matching orders found for the provided IDs");
//       }

//       if (orders.length !== orderIds.length) {
//         const foundIds = orders.map(o => o._id.toString());
//         const missingIds = orderIds.filter(id => !foundIds.includes(id));
//         throw new Error(`Orders not found: ${missingIds.join(', ')}`);
//       }

//       // Auto-skip fully paid orders
//       const activeOrders = orders.filter(o => o.dueAmount > 0);
//       const skippedOrders = orders.filter(o => o.dueAmount === 0).map(o => ({
//         orderId: o._id,
//         reason: 'fully_paid'
//       }));

//       if (activeOrders.length === 0) {
//         throw new Error("All selected orders are already fully paid. No payments to process.");
//       }

//       let allocations = [];

//       // Calculate allocations based on split type
//       if (splitType === "proportional") {
//         const totalDue = activeOrders.reduce((sum, o) => sum + o.dueAmount, 0);

//         if (sanitizedAmount > totalDue) {
//           throw new Error(`Payment amount (₹${sanitizedAmount}) exceeds total due amount (₹${totalDue}) of selected orders.`);
//         }

//         const allocationResults = calculateProportionalAllocation(activeOrders, sanitizedAmount);
//         allocations = allocationResults
//           .filter(result => result.allocated > 0)
//           .map(result => ({
//             order: activeOrders.find(o => o._id.toString() === result._id.toString()),
//             appliedAmount: result.allocated
//           }));

//       } else if (splitType === "custom") {
//         // Validate custom split amounts
//         const customAllocations = updates.map(u => {
//           const order = activeOrders.find(o => o._id.toString() === u.orderId);
//           if (!order) return null;

//           const customAmount = parseDecimal(u.amount || 0);

//           if (customAmount > order.dueAmount) {
//             throw new Error(`Custom amount ₹${customAmount} for order ${order.orderNumber} exceeds due amount ₹${order.dueAmount}`);
//           }

//           return { order, appliedAmount: customAmount };
//         }).filter(Boolean);

//         const totalCustom = customAllocations.reduce((sum, alloc) => sum + alloc.appliedAmount, 0);

//         if (Math.abs(totalCustom - sanitizedAmount) > 0.01) {
//           throw new Error(`Total custom amounts (₹${totalCustom}) must equal payment amount (₹${sanitizedAmount})`);
//         }

//         allocations = customAllocations.filter(alloc => alloc.appliedAmount > 0);
//       }

//       if (allocations.length === 0) {
//         throw new Error("No valid allocations possible. All orders may be fully paid or amounts are zero.");
//       }

//       // Prepare bulk operations
//       const bulkOps = allocations.map(({ order, appliedAmount }) => {
//         const newPaidAmount = parseDecimal(order.paidAmount + appliedAmount);
//         const newDueAmount = parseDecimal(Math.max(order.dueAmount - appliedAmount, 0));

//         const newPayment = {
//           amount: appliedAmount,
//           method,
//           amountReference,
//           paymentDate: new Date(paymentDate),
//           processedBy: req.user.id,
//           createdAt: new Date()
//         };

//         return {
//           updateOne: {
//             filter: { _id: order._id },
//             update: {
//               $push: { payments: newPayment },
//               $set: { 
//                 paidAmount: newPaidAmount, 
//                 dueAmount: newDueAmount,
//                 lastPaymentDate: new Date(paymentDate)
//               }
//             }
//           }
//         };
//       });

//       // Execute bulk operations
//       const bulkResult = await Order.bulkWrite(bulkOps, { 
//         ordered: true, 
//         session 
//       });

//       // Create payment log entry
//       paymentLog = new PaymentLog({
//         reference: amountReference,
//         method,
//         totalAmount: sanitizedAmount,
//         splitType,
//         paymentDate: new Date(paymentDate),
//         userId: req.user.id,
//         allocations: allocations.map(({ order, appliedAmount }) => ({
//           orderId: order._id,
//           appliedAmount,
//           orderNumber: order.orderNumber,
//           clientName: order.companyName
//         })),
//         skippedOrders,
//         transactionMetadata: {
//           requestId: req.id,
//           processingTimeMs: Date.now() - processingStartTime,
//           batchSize: orderIds.length,
//           ipAddress: req.ip,
//           userAgent: req.get('User-Agent')
//         },
//         status: skippedOrders.length > 0 ? 'partially_completed' : 'completed'
//       });

//       await paymentLog.save({ session });

//       // Commit transaction
//       await session.commitTransaction();

//       const totalProcessingTime = Date.now() - processingStartTime;

//       // Log successful completion
//       console.log('✅ Bulk payment completed successfully:', {
//         requestId: req.id,
//         userId: req.user.id,
//         reference: amountReference,
//         totalAmount: sanitizedAmount,
//         allocationsCount: allocations.length,
//         skippedCount: skippedOrders.length,
//         processingTimeMs: totalProcessingTime
//       });

//       // Return success response
//       res.json({
//         message: "✅ Bulk payment processed successfully",
//         data: {
//           reference: amountReference,
//           method,
//           splitType,
//           totalAmount: sanitizedAmount,
//           paymentDate: paymentDate,
//           processed: {
//             orders: allocations.length,
//             totalAllocated: allocations.reduce((sum, alloc) => sum + alloc.appliedAmount, 0)
//           },
//           skipped: {
//             orders: skippedOrders.length,
//             reasons: skippedOrders.map(s => s.reason)
//           },
//           performance: {
//             processingTimeMs: totalProcessingTime,
//             allocationsPerSecond: Math.round((allocations.length / totalProcessingTime) * 1000)
//           }
//         },
//         requestId: req.id,
//         timestamp: new Date().toISOString()
//       });

//     } catch (error) {
//       // Rollback transaction
//       await session.abortTransaction();

//       const processingTime = Date.now() - processingStartTime;

//       // Create failed payment log
//       if (paymentLog) {
//         paymentLog.status = 'failed';
//         paymentLog.errorDetails = {
//           code: error.code || 'PROCESSING_ERROR',
//           message: error.message,
//           recoverable: !error.message.includes('Duplicate')
//         };
//         paymentLog.transactionMetadata.processingTimeMs = processingTime;

//         try {
//           await paymentLog.save();
//         } catch (logError) {
//           console.error('Failed to save error log:', logError);
//         }
//       }

//       // Enhanced error logging
//       console.error('❌ Bulk payment failed:', {
//         requestId: req.id,
//         userId: req.user?.id,
//         error: error.message,
//         stack: error.stack,
//         processingTimeMs: processingTime,
//         timestamp: new Date().toISOString()
//       });

//       // Categorize and return appropriate error response
//       if (error.message.includes('Duplicate payment reference')) {
//         return res.status(409).json({
//           message: "Payment reference already exists",
//           code: 'DUPLICATE_REFERENCE',
//           requestId: req.id
//         });
//       }

//       if (error.message.includes('exceeds total due amount')) {
//         return res.status(400).json({
//           message: error.message,
//           code: 'AMOUNT_EXCEEDS_DUE',
//           requestId: req.id
//         });
//       }

//       if (error.message.includes('fully paid')) {
//         return res.status(400).json({
//           message: error.message,
//           code: 'ORDERS_FULLY_PAID',
//           requestId: req.id
//         });
//       }

//       return res.status(500).json({
//         message: "Payment processing failed. Please try again or contact support.",
//         code: 'PROCESSING_FAILED',
//         requestId: req.id,
//         recoverable: !error.message.includes('Duplicate')
//       });

//     } finally {
//       session.endSession();
//     }
//   }
// );

// // Health check endpoint
// router.get('/health', (req, res) => {
//   res.json({
//     status: 'healthy',
//     timestamp: new Date().toISOString(),
//     version: process.env.API_VERSION || '1.0.0'
//   });
// });

// module.exports = router;

// ------------------------------------------------------

const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
// Remove express-mongo-sanitize from here - we'll use manual sanitization
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const Order = require('../models/Order2');
const PaymentLog = require('../models/PaymentLog2');
const auth = require('../middleware/auth');

const router = express.Router();

// Configuration from environment variables
const config = {
  maxTransactionTimeMs: parseInt(process.env.MAX_TRANSACTION_TIME) || 30000,
  maxBatchSize: parseInt(process.env.MAX_BATCH_SIZE) || 1000,
  jwtSecret: process.env.JWT_SECRET || 'fallback_secret_change_in_production',
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000,
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 10
};

// Manual sanitization function (safer than express-mongo-sanitize)
const sanitizeObject = (obj) => {
  if (obj && typeof obj === 'object') {
    for (const key in obj) {
      if (key.startsWith('$') || key.includes('.')) {
        delete obj[key];
      } else if (typeof obj[key] === 'object') {
        sanitizeObject(obj[key]);
      }
    }
  }
  return obj;
};

// Sanitization middleware
const sanitizeInput = (req, res, next) => {
  if (req.body) {
    req.body = sanitizeObject({ ...req.body });
  }
  if (req.query) {
    req.query = sanitizeObject({ ...req.query });
  }
  if (req.params) {
    req.params = sanitizeObject({ ...req.params });
  }
  next();
};

// Utility functions for decimal precision
const roundToDecimal = (num, decimals = 2) => {
  return Math.round((num + Number.EPSILON) * Math.pow(10, decimals)) / Math.pow(10, decimals);
};

const parseDecimal = (value, decimals = 2) => {
  const num = parseFloat(value) || 0;
  return roundToDecimal(num, decimals);
};

// Enhanced proportional allocation with precision handling
const calculateProportionalAllocation = (orders, totalAmount) => {
  const totalDue = orders.reduce((sum, order) => sum + order.dueAmount, 0);

  if (totalDue === 0) return orders.map(order => ({ ...order, allocated: 0 }));

  let allocations = orders.map(order => ({
    ...order,
    allocated: parseDecimal((order.dueAmount / totalDue) * totalAmount)
  }));

  // Handle rounding differences
  const currentTotal = allocations.reduce((sum, item) => sum + item.allocated, 0);
  const difference = parseDecimal(totalAmount - currentTotal);

  if (Math.abs(difference) > 0.01) {
    const maxDueIndex = allocations.reduce((maxIdx, item, idx) =>
      item.dueAmount > allocations[maxIdx].dueAmount ? idx : maxIdx, 0);

    allocations[maxDueIndex].allocated = parseDecimal(
      allocations[maxDueIndex].allocated + difference
    );
  }

  return allocations;
};

// Rate limiting middleware
const paymentLimiter = rateLimit({
  windowMs: config.rateLimitWindow,
  max: config.rateLimitMax,
  message: {
    message: 'Too many payment requests. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: Math.ceil(config.rateLimitWindow / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  }
});

// Input validation middleware
const validatePaymentInput = [
  body('method')
    .isIn(['Cash', 'Bank', 'UPI', 'Cheque'])
    .withMessage('Invalid payment method'),

  body('amountReference')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-zA-Z0-9\-_\s]+$/)
    .withMessage('Invalid amount reference format'),

  body('amount')
    .isFloat({ min: 0.01, max: 10000000 })
    .withMessage('Amount must be between 0.01 and 10,000,000'),

  body('paymentDate')
    .isISO8601()
    .custom((value) => {
      const date = new Date(value);
      const now = new Date();
      const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

      if (date < oneYearAgo || date > oneYearFromNow) {
        throw new Error('Payment date must be within one year range');
      }
      return true;
    }),

  body('splitType')
    .isIn(['proportional', 'custom'])
    .withMessage('Invalid split type'),

  body('updates')
    .isArray({ min: 1, max: config.maxBatchSize })
    .withMessage(`Updates array must contain 1-${config.maxBatchSize} items`),

  body('updates.*.orderId')
    .optional()
    .isMongoId()
    .withMessage('Invalid order ID format'),

  body('updates.*.amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Custom amount must be non-negative')
];

// Request ID middleware
router.use(auth, (req, res, next) => {
  req.id = uuidv4();
  req.startTime = Date.now();

  // Log incoming request
  console.log('Incoming payment request:', {
    requestId: req.id,
    userId: req.user?.id,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  next();
});

// Apply manual sanitization instead of express-mongo-sanitize
router.use(sanitizeInput);

// Main bulk payment route
router.put('/orders/payments/bulk',
  paymentLimiter,
  auth,
  validatePaymentInput,
  async (req, res) => {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        errors: errors.array(),
        requestId: req.id
      });
    }

    const session = await mongoose.startSession();
    let paymentLog = null;
    const processingStartTime = Date.now();

    try {
      // Start transaction with timeout and proper options
      session.startTransaction({
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority", j: true },
        maxTimeMS: config.maxTransactionTimeMs
      });

      const { method, amountReference, amount, splitType, updates, paymentDate } = req.body;
      const sanitizedAmount = parseDecimal(amount);

      // Enhanced debugging for order ID mismatch
      console.log('🔍 Debug - Request payload:', {
        requestId: req.id,
        updatesReceived: updates,
        updatesLength: updates.length,
        updatesType: typeof updates,
        sampleUpdate: updates[0]
      });

      // Enhanced duplicate check
      const duplicateCheck = await Order.findOne(
        {
          "payments.amountReference": amountReference,
          // Optional: Add user-specific duplicate checking
          // userId: req.user.id 
        },
        null,
        { session }
      );

      if (duplicateCheck) {
        throw new Error(`Duplicate payment reference: ${amountReference}. Please use a unique reference.`);
      }

      // Fetch and validate orders
      // const orderIds = updates.map(u => typeof u === "string" ? u : u.orderId);
      const orderIds = updates.map(u => {
        if (typeof u === "string") {
          return u; // For proportional mode
        } else if (u && u.orderId) {
          return u.orderId; // For custom mode
        } else {
          throw new Error(`Invalid update format: ${JSON.stringify(u)}`);
        }
      });

      console.log('🔍 Trying query without session...');
      const ordersWithoutSession = await Order.find({
        _id: { $in: orderIds }
      });

      console.log('Orders found without session:', ordersWithoutSession.length);
      
      const orders = await Order.find({
        _id: { $in: orderIds },
        // Optional: Add user ownership check
        // userId: req.user.id
      }).session(session);

      console.log('Orders found with session:', orders.length);

      // Validate all IDs are proper MongoDB ObjectIds
      const invalidIds = orderIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
      if (invalidIds.length > 0) {
        throw new Error(`Invalid MongoDB ObjectId format: ${invalidIds.join(', ')}`);
      }

      console.log('🔍 Extracted order IDs:', {
        requestId: req.id,
        orderIds,
        idsLength: orderIds.length,
        firstId: orderIds[0],
        firstIdType: typeof orderIds[0]
      });


      if (orders.length === 0) {
        throw new Error("No matching orders found for the provided IDs");
      }

      if (orders.length !== orderIds.length) {
        const foundIds = orders.map(o => o._id.toString());
        const missingIds = orderIds.filter(id => !foundIds.includes(id));
        throw new Error(`Orders not found: ${missingIds.join(', ')}`);
      }

      // Auto-skip fully paid orders
      const activeOrders = orders.filter(o => o.dueAmount > 0);
      const skippedOrders = orders.filter(o => o.dueAmount === 0).map(o => ({
        orderId: o._id,
        reason: 'fully_paid'
      }));

      if (activeOrders.length === 0) {
        throw new Error("All selected orders are already fully paid. No payments to process.");
      }

      var allocations = [];

      // Calculate allocations based on split type
      if (splitType === "proportional") {
        const totalDue = activeOrders.reduce((sum, o) => sum + o.dueAmount, 0);
        console.log('🔍 Total due amount for proportional split:', totalDue);

        if (sanitizedAmount > totalDue) {
          throw new Error(`Payment amount (₹${sanitizedAmount}) exceeds total due amount (₹${totalDue}) of selected orders.`);
        }

        const allocationResults = calculateProportionalAllocation(activeOrders, sanitizedAmount);
        console.log('🔍 Proportional allocation results:', allocationResults);
        allocations = allocationResults
          .filter(result => result.allocated > 0)
          .map(result => ({
            // order: activeOrders.find(o => o._id.toString() === result._id.toString()),
            order: activeOrders.find(o => o._id === result._id),
            appliedAmount: result.allocated
          }));

      } else if (splitType === "custom") {
        // Validate custom split amounts
        const customAllocations = updates.map(u => {
          const order = activeOrders.find(o => o._id.toString() === u.orderId);
          if (!order) return null;

          const customAmount = parseDecimal(u.amount || 0);

          if (customAmount > order.dueAmount) {
            throw new Error(`Custom amount ₹${customAmount} for order ${order.orderNumber} exceeds due amount ₹${order.dueAmount}`);
          }

          return { order, appliedAmount: customAmount };
        }).filter(Boolean);

        const totalCustom = customAllocations.reduce((sum, alloc) => sum + alloc.appliedAmount, 0);

        if (Math.abs(totalCustom - sanitizedAmount) > 0.01) {
          throw new Error(`Total custom amounts (₹${totalCustom}) must equal payment amount (₹${sanitizedAmount})`);
        }

        allocations = customAllocations.filter(alloc => alloc.appliedAmount > 0);
      }

      if (allocations.length === 0) {
        throw new Error("No valid allocations possible. All orders may be fully paid or amounts are zero.");
      }

      // Prepare bulk operations
      const bulkOps = allocations.map(({ order, appliedAmount }) => {
        console.log('Preparing bulk operation for order:', order);
        const newPaidAmount = parseDecimal(order.paidAmount + appliedAmount);
        const newDueAmount = parseDecimal(Math.max(order.dueAmount - appliedAmount, 0));

        const newPayment = {
          amount: appliedAmount,
          method,
          amountReference,
          paymentDate: new Date(paymentDate),
          processedBy: req.user.id,
          createdAt: new Date()
        };

        return {
          updateOne: {
            filter: { _id: order._id },
            update: {
              $push: { payments: newPayment },
              $set: {
                paidAmount: newPaidAmount,
                dueAmount: newDueAmount,
                lastPaymentDate: new Date(paymentDate)
              }
            }
          }
        };
      });

      // Execute bulk operations
      const bulkResult = await Order.bulkWrite(bulkOps, {
        ordered: true,
        session
      });

      // Create payment log entry
      paymentLog = new PaymentLog({
        reference: amountReference,
        method,
        totalAmount: sanitizedAmount,
        splitType,
        paymentDate: new Date(paymentDate),
        userId: req.user.id,
        allocations: allocations.map(({ order, appliedAmount }) => ({
          orderId: order._id,
          appliedAmount,
          orderNumber: order.orderNumber,
          clientName: order.companyName
        })),
        skippedOrders,
        transactionMetadata: {
          requestId: req.id,
          processingTimeMs: Date.now() - processingStartTime,
          batchSize: orderIds.length,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        },
        status: skippedOrders.length > 0 ? 'partially_completed' : 'completed'
      });

      await paymentLog.save({ session });

      // Commit transaction
      await session.commitTransaction();

      const totalProcessingTime = Date.now() - processingStartTime;

      // Log successful completion
      console.log('✅ Bulk payment completed successfully:', {
        requestId: req.id,
        userId: req.user.id,
        reference: amountReference,
        totalAmount: sanitizedAmount,
        allocationsCount: allocations.length,
        skippedCount: skippedOrders.length,
        processingTimeMs: totalProcessingTime
      });

      // Return success response
      res.json({
        message: "✅ Bulk payment processed successfully",
        data: {
          reference: amountReference,
          method,
          splitType,
          totalAmount: sanitizedAmount,
          paymentDate: paymentDate,
          processed: {
            orders: allocations.length,
            totalAllocated: allocations.reduce((sum, alloc) => sum + alloc.appliedAmount, 0)
          },
          skipped: {
            orders: skippedOrders.length,
            reasons: skippedOrders.map(s => s.reason)
          },
          performance: {
            processingTimeMs: totalProcessingTime,
            allocationsPerSecond: Math.round((allocations.length / totalProcessingTime) * 1000)
          }
        },
        requestId: req.id,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      // Rollback transaction
      await session.abortTransaction();

      const processingTime = Date.now() - processingStartTime;

      // Enhanced error logging
      console.error('❌ Bulk payment failed:', {
        requestId: req.id,
        userId: req.user?.id,
        error: error.message,
        stack: error.stack,
        processingTimeMs: processingTime,
        timestamp: new Date().toISOString()
      });

      // Categorize and return appropriate error response
      if (error.message.includes('Duplicate payment reference')) {
        return res.status(409).json({
          message: "Payment reference already exists",
          code: 'DUPLICATE_REFERENCE',
          requestId: req.id
        });
      }

      if (error.message.includes('exceeds total due amount')) {
        return res.status(400).json({
          message: error.message,
          code: 'AMOUNT_EXCEEDS_DUE',
          requestId: req.id
        });
      }

      if (error.message.includes('fully paid')) {
        return res.status(400).json({
          message: error.message,
          code: 'ORDERS_FULLY_PAID',
          requestId: req.id
        });
      }

      return res.status(500).json({
        message: "Payment processing failed. Please try again or contact support.",
        code: 'PROCESSING_FAILED',
        requestId: req.id,
        recoverable: !error.message.includes('Duplicate')
      });

    } finally {
      session.endSession();
    }
  }
);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.API_VERSION || '1.0.0'
  });
});

module.exports = router;