const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order2');
const Profile = require('../models/Profile');
// const Profile = require('../routes/profile');
const router = express.Router();
const fs = require('fs');
const path = require('path');
// const invoiceTable = require('../public/invoiceTable.html');
const auth = require('../middleware/auth');
// const PaymentLog = require('../models/PaymentLog2');

const syncClientData = require("../utils/syncClientData");

const { getSalesAnalytics, getAllOrders } = require('../controllers/orderController');
const Client = require('../models/Client');

router.get('/sales-analytics', auth, getSalesAnalytics);
router.get('/all-orders', auth, getAllOrders);


router.post("/orders/create", auth, async (req, res) => {
  try {
    // const newOrder = new Order(req.body);
    const newOrder = new Order({
      ...req.body,
      createdBy: req.user.id, // Associate order with the authenticated user
    });

    // const qrCodeData = await QRCode.toDataURL(newOrder.orderNumber);
    // newOrder.qrCode = qrCodeData;
    await newOrder.save();

    // Sync client data
    await syncClientData(newOrder.clientId);

    res.status(201).json({ success: true, order: newOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Order by ID
router.get("/orders/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// // Sync client data if clientId is updated
// if (req.body.clientId) {
//   await syncClientData(req.body.clientId);
// }


// Update Order Details
// router.patch("/orders/:id/update", async (req, res) => {
router.put("/orders/:id/update", async (req, res) => {
  try {
    const updatedOrder = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedOrder) return res.status(404).json({ success: false, message: "Order not found" });

    // // Sync client data if clientId is updated
    // if (req.body.clientId) {
    //   await syncClientData(req.body.clientId);
    // }

    res.json({ success: true, message: "Order updated successfully", order: updatedOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.patch("/orders/:id/upd", async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Ensure statusHistory array exists
    if (!order.statusHistory) {
      order.statusHistory = [];
    }

    // Add new status to history
    order.statusHistory.push({
      status,
      timestamp: new Date(),
    });

    // Update the current status
    order.status = status;

    await order.save();
    res.json({ message: "Order status updated", order });
  } catch (error) {
    res.status(500).json({ message: "Error updating order", error });
  }
});

// Delete Order (Only if no pending amount)
router.delete("/orders/:id/delete", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);


    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (order.dueAmount > 0) return res.status(400).json({ success: false, message: "Cannot delete order with pending amount." });

    await Order.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Order deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get All Orders (with Filters)
router.get("/orders", auth, async (req, res) => {
  try {
    const filters = req.query;
    // const orders = await Order.find(filters);
    const orders = await Order.find({ createdBy: req.user.id, ...filters })
    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


router.post("/orders/:id/pay", async (req, res) => {
  // // router.patch("/orders/:id/pay", async (req, res) => {
  // using
  try {
    const { amount, method, amountReference } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (amount > order.dueAmount) return res.status(400).json({ message: "Amount exceeds due balance" });

    // Add new payment
    // order.payments.push({ amount, method });
    order.payments.push({ amount, method, amountReference });
    // // paymentHistory -> payments

    // ✅ Update amounts

    // order.paidAmount = (order.paidAmount || 0) + amount;
    order.paidAmount = (parseFloat(order.paidAmount) || 0) + parseFloat(amount);

    // order.paidAmount += amount;
    order.dueAmount -= amount;

    // Force recalculation of dueAmount
    await order.save();
    // Sync client data

    await syncClientData(order.clientId);

    // await updateClientPaymentData(order.clientId.toHexString());

    res.json({ success: true, message: "Payment recorded successfully", order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/orders/:id/payments", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    res.json(order.payments);
  } catch (error) {
    res.status(500).json({ message: "Error fetching payments", error });
  }
});

router.put("/orders/:orderId/payments/:paymentId", async (req, res) => {
  // using
  try {
    const { amount, method, amountReference } = req.body;
    const order = await Order.findById(req.params.orderId);

    if (!order) return res.status(404).json({ message: "Order not found" });

    // Find the payment entry
    const payment = order.payments.id(req.params.paymentId);

    if (!payment) return res.status(404).json({ message: "Payment not found" });

    // Adjust dueAmount & paidAmount
    const oldAmount = payment.amount;
    order.paidAmount = order.paidAmount - oldAmount + amount;
    order.dueAmount = order.dueAmount + oldAmount - amount;

    // Update payment details
    payment.amount = amount;
    payment.method = method;
    payment.amountReference = amountReference;

    await order.save();
    // Sync client data
    await syncClientData(order.clientId);

    res.json({ message: "Payment updated", order });
  } catch (error) {
    res.status(500).json({ message: "Error updating payment", error });
  }
});

// Audit Log Schema (separate collection)
const PaymentLog = mongoose.model("PaymentLog", new mongoose.Schema({
  reference: { type: String },
  method: String,
  totalAmount: Number,
  splitType: String,
  allocations: [
    {
      orderId: mongoose.Schema.Types.ObjectId,
      appliedAmount: Number
    }
  ],
  skippedOrders: [mongoose.Schema.Types.ObjectId],
  paymentDate: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true }));

// Bulk Payment Route
router.put("/orders/payments/bulk", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { method, amountReference, amount, splitType, updates, paymentDate } = req.body;

    if (!method || !amount || !splitType || !Array.isArray(updates) || updates.length === 0 || !paymentDate) {
      return res.status(400).json({
        message: "method, amount, splitType, updates[], and paymentDate are required"
      });
    }

    if (!["proportional", "custom"].includes(splitType)) {
      return res.status(400).json({ message: "Invalid splitType. Use 'proportional' or 'custom'." });
    }

    // ✅ Duplicate Payment Reference Check
    const duplicate = await Order.findOne(
      { "payments.amountReference": amountReference },
      null,
      { session }
    );
    if (duplicate) {
      throw new Error(`Duplicate payment reference detected: ${amountReference}`);
    }

    // Fetch Orders
    const orders = await Order.find({ _id: { $in: updates.map(u => typeof u === "string" ? u : u.orderId) } })
      .session(session);

    if (orders.length === 0) throw new Error("No matching orders found");

    // ✅ Auto-skip fully paid orders
    const activeOrders = orders.filter(o => o.dueAmount > 0);

    if (activeOrders.length === 0) {
      throw new Error("All selected orders are already fully paid.");
    }

    let allocations = [];

    // ============================================================
    // ✅ FIXED: PROPORTIONAL SPLIT (decimal-safe with integer paise)
    // ============================================================
    if (splitType === "proportional") {
      const toCents = n => Math.round(n * 100);  // convert rupees to integer paise
      const fromCents = c => c / 100;

      const totalDueCents = activeOrders.reduce((sum, o) => sum + toCents(o.dueAmount), 0);
      const amountCents = toCents(amount);

      if (totalDueCents <= 0) throw new Error("No positive due amounts to allocate.");
      if (amountCents > totalDueCents) throw new Error("Payment exceeds total due amount of selected orders.");

      // Step 1: compute exact proportional shares (float math)
      const rawShares = activeOrders.map(o => {
        const dueCents = toCents(o.dueAmount);
        const exact = (dueCents / totalDueCents) * amountCents;
        return { order: o, exact };
      });

      // Step 2: floor to integer cents, keep fractional remainder
      allocations = rawShares.map(r => ({
        order: r.order,
        appliedCents: Math.floor(r.exact),
        frac: r.exact - Math.floor(r.exact)
      }));

      // Step 3: distribute remainder to highest fractional parts
      let allocatedTotal = allocations.reduce((s, a) => s + a.appliedCents, 0);
      let remainder = amountCents - allocatedTotal;

      const byFrac = [...allocations].sort((a, b) => b.frac - a.frac);
      for (const a of byFrac) {
        if (remainder <= 0) break;
        const cap = toCents(a.order.dueAmount) - a.appliedCents;
        if (cap <= 0) continue;
        const give = Math.min(1, cap, remainder); // 1 paisa at a time
        a.appliedCents += give;
        remainder -= give;
      }

      // Step 4: second pass (safety)
      if (remainder > 0) {
        for (const a of byFrac) {
          if (remainder <= 0) break;
          const cap = toCents(a.order.dueAmount) - a.appliedCents;
          if (cap <= 0) continue;
          const give = Math.min(cap, remainder);
          a.appliedCents += give;
          remainder -= give;
        }
      }

      if (remainder > 0) {
        throw new Error("Unable to allocate full amount without exceeding due amounts (after rounding).");
      }

      // Step 5: convert back to rupees
      allocations = allocations.map(({ order, appliedCents }) => ({
        order,
        appliedAmount: fromCents(appliedCents)
      }));
    }

    // ============================================================
    // ✅ CUSTOM SPLIT (unchanged)
    // ============================================================
    else if (splitType === "custom") {
      let totalCustom = updates.reduce((sum, u) => sum + (u.amount || 0), 0);
      if (totalCustom !== amount) {
        throw new Error("Custom split amounts must equal total amount.");
      }

      allocations = updates.map(u => {
        const order = activeOrders.find(o => o._id.toString() === u.orderId);
        if (!order) return null; // skip fully paid
        if (u.amount > order.dueAmount) {
          throw new Error(`Custom amount for order ${u.orderId} exceeds dueAmount`);
        }
        return { order, appliedAmount: u.amount };
      }).filter(Boolean);
    }

    if (allocations.length === 0) {
      throw new Error("No valid allocations possible (all fully paid skipped).");
    }

    // ============================================================
    // ✅ BULK DATABASE UPDATES
    // ============================================================
    const bulkOps = allocations
      .filter(a => a.appliedAmount > 0)
      .map(({ order, appliedAmount }) => {
        const newPaidAmount = order.paidAmount + appliedAmount;
        const newDueAmount = Math.max(order.dueAmount - appliedAmount, 0);

        const newPayment = {
          amount: appliedAmount,
          method,
          amountReference,
          paymentDate: new Date(paymentDate)
        };

        return {
          updateOne: {
            filter: { _id: order._id },
            update: {
              $push: { payments: newPayment },
              $set: { paidAmount: newPaidAmount, dueAmount: newDueAmount }
            }
          }
        };
      });

    if (bulkOps.length > 0) {
      await Order.bulkWrite(bulkOps, { ordered: true, session });
    }

    // ============================================================
    // ✅ UPDATE PAYMENT STATUS
    // ============================================================
    for (const { order, appliedAmount } of allocations) {
      if (appliedAmount > 0) {
        const updatedOrder = await Order.findById(order._id).session(session);
        if (updatedOrder) {
          if (updatedOrder.dueAmount === 0) {
            updatedOrder.paymentStatus = "Paid";
            updatedOrder.dueAmount = 0;
          } else if (updatedOrder.dueAmount < updatedOrder.roundOffFinalRevenue) {
            updatedOrder.paymentStatus = "Partial";
          } else {
            updatedOrder.paymentStatus = "Unpaid";
          }
          await updatedOrder.save({ session });
        }
      }
    }

    // ✅ Commit Transaction
    await session.commitTransaction();
    session.endSession();

    const skippedOrders = orders.filter(o => o.dueAmount === 0).map(o => o._id.toString());

    // ✅ Audit Logging
    await PaymentLog.create({
      reference: amountReference,
      method,
      paymentDate,
      totalAmount: amount,
      splitType,
      allocations: allocations.map(a => ({
        orderId: a.order._id,
        appliedAmount: a.appliedAmount
      })),
      skippedOrders
    });

    // ✅ Post-commit Client Sync
    await Promise.allSettled(
      allocations.map(({ order }) => syncClientData(order.clientId))
    );

    return res.json({
      message: "✅ Bulk payment distribution successful (transactional, validated, logged)",
      method,
      amountReference,
      splitType,
      totalAmount: amount,
      allocations: allocations.map(a => ({
        orderId: a.order._id,
        appliedAmount: a.appliedAmount
      })),
      skippedOrders,
      paymentDate
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ Transaction aborted:", error);

    return res.status(500).json({
      message: "Bulk payment distribution failed. Transaction rolled back.",
      error: error.message
    });
  }
});

router.delete("/orders/:orderId/payments/:paymentId", async (req, res) => {
  // using
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const payment = order.payments.id(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    // Adjust dueAmount & paidAmount
    order.paidAmount -= payment.amount;
    order.dueAmount += payment.amount;

    // Remove payment entry
    order.payments.pull({ _id: req.params.paymentId });

    await order.save();

    // Sync client data
    await syncClientData(order.clientId);

    res.json({ message: "Payment deleted", order });
  } catch (error) {
    res.status(500).json({ message: "Error deleting payment", error });
  }
});

function numberToWords(amount) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const scales = ['', 'Thousand', 'Lakh', 'Crore'];

  if (amount === 0) return 'Zero Rupees Only';

  let num = Math.floor(amount), words = [], scale = 0;

  while (num > 0) {
    let chunk = scale === 0 ? num % 1000 : num % 100;
    num = Math.floor(num / (scale === 0 ? 1000 : 100));

    if (chunk > 0) {
      let chunkWords = [];
      if (chunk >= 100) {
        chunkWords.push(ones[Math.floor(chunk / 100)], 'Hundred');
        chunk %= 100;
      }
      if (chunk > 0) {
        chunkWords.push(chunk < 20 ? ones[chunk] :
          `${tens[Math.floor(chunk / 10)]}${chunk % 10 ? ' ' + ones[chunk % 10] : ''}`);
      }
      if (scale > 0) chunkWords.push(scales[scale]);
      words = chunkWords.concat(words);
    }
    scale++;
  }

  return words.join(' ') + ' Rupees Only';
}

// router.get("/:orderId/invoice", async (req, res) => {
router.get("/:orderId/payments/:paymentId/invoice", async (req, res) => {

  try {
    const { orderId, paymentId } = req.params;

    // Fetch order and payment details
    const order = await Order.findById(orderId).populate("payments");
    if (!order) return res.status(404).json({ message: "Order not found" });

    const payment = order.payments.find(p => p._id.toString() === paymentId);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    const receiptTemplatePath = path.join(__dirname, '../public/reciptTable.html');

    let invoiceHtml = fs.readFileSync(receiptTemplatePath, 'utf8');


    invoiceHtml = invoiceHtml.replaceAll('VorderNumber', order.orderNumber || 'N/A');
    invoiceHtml = invoiceHtml.replace('VorderName', order.orderName || 'N/A');


    invoiceHtml = invoiceHtml.replace('VpaymentId', payment._id || 'N/A');
    invoiceHtml = invoiceHtml.replace('VreceiptCreatedDate', payment.createdAt || 'N/A');
    invoiceHtml = invoiceHtml.replace('VreceiptPaymentMode', payment.method || 'N/A');
    invoiceHtml = invoiceHtml.replace('VreceiptPaymentReference', payment.amountReference || 'N/A');

    // invoiceHtml = invoiceHtml.replaceAll('VtodayDate', new Date.now() || 'N/A');


    invoiceHtml = invoiceHtml.replace('VclintCompanyName', order.companyName || 'N/A');
    invoiceHtml = invoiceHtml.replace('VclintAddress', order.Address || 'N/A');
    invoiceHtml = invoiceHtml.replace('VclintEmail', order.Address || 'N/A'); //
    invoiceHtml = invoiceHtml.replace('VclintPhoneNumber', order.Address || 'N/A'); //
    invoiceHtml = invoiceHtml.replace('VclintGstNumber', order.gstNumber || 'N/A');
    invoiceHtml = invoiceHtml.replace('VclintChallanNumber', order.challanNumber || 'N/A');


    invoiceHtml = invoiceHtml.replaceAll('VamountReceived', payment.amount || 'N/A');
    invoiceHtml = invoiceHtml.replaceAll('VorderFinalRevenue', order.finalRevenue || 'N/A');


    res.send(invoiceHtml);

  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/:orderId/invoice", async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).populate("payments");
    if (!order) return res.status(404).json({ message: "Order not found" });

    const profile = await Profile.findOne({ createdBy: order.createdBy });
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    const client = await Client.findById(order.clientId);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const convertDate = (inputDate) => {
      const date = new Date(inputDate);
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const dayName = dayNames[date.getDay()];
      return `${day}/${month}/${year} (${dayName})`;
    };

    const adjustValue = (value) => {
      if (typeof value !== 'number') return null;

      const decimalPart = value % 1;
      let adjustedValue;
      let diffValue;

      if (decimalPart >= 0.5) {
        adjustedValue = Math.ceil(value);
        diffValue = adjustedValue - value; // positive difference
      } else {
        adjustedValue = Math.floor(value);
        diffValue = adjustedValue - value; // negative difference
      }
      return {
        adjusted: adjustedValue,
        difference: diffValue.toFixed(2)
      };
    }


    const paymentDueDate = new Date(order.orderDate);
    paymentDueDate.setDate(paymentDueDate.getDate() + Number(order.paymentTerms));

    const { adjusted, difference } = adjustValue(order.finalRevenue);

    res.render("../public/invoiceTable.ejs", {

      profileHeaderTitle: profile.headerTitle || 'Default Header Title',
      profileCompanyName: profile.companyName || 'Default Company Name',
      profileCompanyAddress: profile.companyAddress || 'Default Address',
      profilePhoneNumber1: profile.phoneNumber1 || 'N/A',
      profilePhoneNumber2: profile.phoneNumber2 || 'N/A',
      profileGstNumber: profile.gstin || 'N/A',
      profilePanNumber: profile.pan || 'N/A',
      profileBankName: profile.bankName || 'N/A',
      profileAccountNo: profile.accountNo || 'N/A',
      profileBranchName: profile.branchName || 'N/A',
      profileIfsc: profile.ifsc || 'N/A',


      clientChallanNumber: order.challanNumber || 'N/A',
      clientCompanyName: order.companyName || 'N/A',
      clientAddress: order.Address || 'N/A',
      clientPhoneNumber: client.phone || 'N/A',
      clientGstNumber: order.gstNumber || 'N/A',
      clientState: client.state || 'N/A',

      orderNumber: order.orderNumber || '00',
      createdAt: convertDate(order.orderDate),
      dueDate: convertDate(paymentDueDate),
      paymentTerm: order.paymentTerms || 'N/A',
      ewayBillNo: order.ewbDetails.ewbNo || 'N/A',

      subOrders: order.subOrders || [],
      designNumber: order.designNumber || 'N/A',
      // orderName: order.orderName || 'N/A',
      // orderQty: order.quantity || '00',
      // orderUnitRate: order.unitPrice || '00',
      orderTotalCost: order.totalCost || '00',
      orderSubTotal: (order.totalCost + order.discountAmount) || '00',
      orderDisRate: order.discountRate || '00',
      orderDiscountAmount: order.discountAmount || '00',
      orderShortPcs: order.shortPcs || '00',
      orderShortPcsAmount: (order.shortPcs * order.unitPrice) || '00',
      orderTax: (order.taxPercentage / 2) || '00',
      orderTaxAmount: (order.taxAmount / 2) || '00',
      orderIgstTax: Number(order.stateCode) !== Number(profile.stateCode) ? (order.taxPercentage) : '00',
      orderIgstTaxAmount: Number(order.stateCode) !== Number(profile.stateCode) ? (order.taxAmount) : '00',
      // orderFinalRevenue: (adjustValue(order.finalRevenue)?.original ?? '00'),
      // orderFinalRevenueRoundOff: (adjustValue(order.finalRevenue)?.difference ?? '00'),
      // orderFinalRevenueAfterRoundOff: (adjustValue(order.finalRevenue)?.adjusted ?? '00'),
      // orderFinalRevenueInWords: numberToWords(order.finalRevenue) || 'Zero Rupees Only'
      orderFinalRevenue: order.finalRevenue || '00',
      orderFinalRevenueRoundOff: difference ?? '00',
      orderFinalRevenueAfterRoundOff: adjusted ?? '00',
      orderFinalRevenueInWords: numberToWords(adjusted) || 'Zero Rupees Only'
    });

  } catch (error) {
    res.status(500).json({ message: "Error generating invoice", error });
  }
});

router.get("/:orderId/KachuBill", async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).populate("payments");
    if (!order) return res.status(404).json({ message: "Order not found" });

    const convertDate = (inputDate) => {
      const date = new Date(inputDate);
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const dayName = dayNames[date.getDay()];
      return `${day}/${month}/${year} (${dayName})`;
    };

    const paymentDueDate = new Date(order.orderDate);
    paymentDueDate.setDate(paymentDueDate.getDate() + Number(order.paymentTerms));

    res.render("../public/Kachu.ejs", {
      clientChallanNumber: order.challanNumber || 'N/A',
      clientCompanyName: order.companyName || 'N/A',
      clientAddress: order.Address || 'N/A',
      clientPhoneNumber: order.phoneNumber || 'N/A',
      clientGstNumber: order.gstNumber || 'N/A',

      orderNumber: order.orderNumber || '00',
      createdAt: convertDate(order.createdAt),
      dueDate: convertDate(paymentDueDate),
      paymentTerm: order.paymentTerms || 'N/A',

      subOrders: order.subOrders || [],
      designNumber: order.designNumber || 'N/A',
      // orderName: order.orderName || 'N/A',
      // orderQty: order.quantity || '00',
      // orderUnitRate: order.unitPrice || '00',
      orderTotalCost: order.totalCost || '00',
      orderSubTotal: (order.totalCost + order.discountAmount) || '00',
      orderDisRate: order.discountRate || '00',
      orderDiscountAmount: order.discountAmount || '00',
      orderShortPcs: order.shortPcs || '00',
      orderShortPcsAmount: (order.shortPcs * order.unitPrice) || '00',
      orderTax: (order.taxPercentage / 2) || '00',
      orderTaxAmount: (order.taxAmount / 2) || '00',
      orderFinalRevenue: order.finalRevenue || '00',
      orderFinalRevenueInWords: numberToWords(order.roundOffFinalRevenue) || 'Zero Rupees Only'
    });

  } catch (error) {
    res.status(500).json({ message: "Error generating invoice", error });
  }
});


// Automated Payment Reminders
const sendPaymentReminder = async () => {
  const pendingOrders = await Order.find({ paymentStatus: { $ne: "Paid" } });
  pendingOrders.forEach(async (order) => {
    const client = await Client.findById(order.clientId);
    if (client && client.email) {
      const transporter = nodemailer.createTransport({
        service: "Gmail",
        auth: { user: "your-email@gmail.com", pass: "your-password" },
      });

      const mailOptions = {
        from: "your-email@gmail.com",
        to: client.email,
        subject: "Payment Reminder",
        text: `Dear ${client.name},\n\nYour order (${order.orderNumber}) has a pending amount of ${order.dueAmount}. Please make the payment at your earliest convenience.\n\nThank you.`,
      };

      await transporter.sendMail(mailOptions);
    }
  });
};

// Run payment reminders every 24 hours
//   setInterval(sendPaymentReminder, 24 * 60 * 60 * 1000);

module.exports = router;