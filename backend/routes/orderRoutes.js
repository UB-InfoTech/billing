const express = require('express');
const Order = require('../models/Order');
const router = express.Router();
// const axios = require('axios');
const QRCode = require("qrcode");
// const stripe = require("stripe")("your-stripe-secret-key");
const fs = require('fs');
const path = require('path');

const syncClientData = require("../utils/syncClientData");

const { getSalesAnalytics, getAllOrders } = require('../controllers/orderController');

router.get('/sales-analytics', getSalesAnalytics);
router.get('/all-orders', getAllOrders);


// const updateClientPaymentData = require("../utils/syncClientData2");

// // Create Order
// router.post("/orders/create", async (req, res) => {
//     try {
//       const newOrder = new Order(req.body);
//       await newOrder.save();
//       res.status(201).json({ success: true, order: newOrder });
//     } catch (error) {
//       res.status(500).json({ success: false, message: error.message });
//     }
//   });


// Create Order with QR Code
router.post("/orders/create", async (req, res) => {
  try {
    const newOrder = new Order(req.body);
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


// Update Order Details (PUT method)
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

// Update Order Details
router.patch("/orders/:id/update", async (req, res) => {
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


// // Update Order
// // router.patch("/orders/:id/update", async (req, res) => {
// router.put("/orders/:id/update", async (req, res) => {
//   try {
//     // const { status } = req.body;
//     const order = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true });

//     console.log(order , "order router.patch update");

//     if (!order) return res.status(404).json({ success: false, message: "Order not found" });
//     res.json({ success: true, order });

//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// });

// Update Order Status & Save Status History
// router.put("/orders/:id/upd", async (req, res) => {
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

//   // Delete Order
//   router.delete("/orders/:id/delete", async (req, res) => {
//     try {
//       await Order.findByIdAndDelete(req.params.id);
//       res.json({ success: true, message: "Order deleted successfully" });
//     } catch (error) {
//       res.status(500).json({ success: false, message: error.message });
//     }
//   });

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
router.get("/orders", async (req, res) => {
  try {
    const filters = req.query;
    const orders = await Order.find(filters);
    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add Tracking Event
router.post("/orders/:id/track", async (req, res) => {
  try {
    const { stage } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    order.tracking.push({ stage, timestamp: new Date() });
    await order.save();
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Process Payment
// stripe payment method
// router.post("/orders/:id/pay", async (req, res) => {
//     try {
//         const { amount, currency, paymentMethodId } = req.body;
//         const order = await Order.findById(req.params.id);
//         if (!order) return res.status(404).json({ success: false, message: "Order not found" });

//         const paymentIntent = await stripe.paymentIntents.create({
//             amount,
//             currency,
//             payment_method: paymentMethodId,
//             confirm: true,
//         });

//         order.paymentIntentId = paymentIntent.id;
//         order.paymentStatus = "paid";
//         order.paymentReceipt = paymentIntent.charges.data[0].receipt_url;
//         order.dueAmount = 0;
//         await order.save();

//         res.json({ success: true, order, paymentIntent });
//     } catch (error) {
//         res.status(500).json({ success: false, message: error.message });
//     }
// });

// Manual Payment Method
// router.post("/orders/:id/pay", async (req, res) => {
//     try {
//       const { amount, method, amountReference } = req.body;
//       const order = await Order.findById(req.params.id);
//       if (!order) {
//         return res.status(404).json({ success: false, message: "Order not found" });
//       }
//       order.payments.push({ amount, method, amountReference });
//       await order.save();
//       res.json({ success: true, message: "Payment recorded successfully", order });
//     } catch (error) {
//       res.status(500).json({ success: false, message: error.message });
//     }
//   });

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
    // const order = await Order.findById(req.params.orderId)
    //   .populate("client")  // Fetch client details
    //   .populate("payments"); // Fetch payments

    // if (!order) {
    //   return res.status(404).json({ message: "Order not found" });
    // }

    // // Calculate total paid amount
    // const totalPaid = order.payments.reduce((sum, payment) => sum + payment.amount, 0);

    // // Prepare response
    // const invoiceData = {
    //   orderId: order._id,
    //   clientName: order.client.name,
    //   clientGST: order.client.gstNumber || "N/A",
    //   clientAddress: order.client.address || "N/A",
    //   orderDate: order.createdAt.toISOString().split("T")[0],
    //   dueAmount: order.dueAmount,
    //   totalAmount: order.totalAmount,
    //   paidAmount: totalPaid,
    //   tax: order.tax || 18, // Default GST 18%
    //   items: order.items.map((item) => ({
    //     name: item.name,
    //     quantity: item.quantity,
    //     rate: item.rate,
    //     total: item.quantity * item.rate,
    //   })),
    // };

    // res.json(invoiceData);

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

// router.get("/:orderId/payments/:paymentId/invoice", async (req, res) => {
router.get("/:orderId/invoice", async (req, res) => {

  // using
  try {
    const { orderId } = req.params;

    // Fetch order and payment details
    const order = await Order.findById(orderId).populate("payments");
    if (!order) return res.status(404).json({ message: "Order not found" });

    // // -------------------
    // const invoiceHtml = `
    //   <html>
    //   <head><title>Invoice</title></head>
    //   <body>
    //     <h1>Tax Invoice</h1>
    //     <p><strong>Order ID:</strong> ${order._id}</p>
    //     <p><strong>Payment ID:</strong> ${payment._id}</p>
    //     <p><strong>Amount:</strong> ₹${payment.amount}</p>
    //     <p><strong>Method:</strong> ${payment.method}</p>
    //     <p><strong>Date:</strong> ${new Date(payment.createdAt).toLocaleString()}</p>
    //     <button onclick="window.print()">Print Invoice</button>
    //   </body>
    //   </html>
    // `;
    // // -------------------


    // Read the contents of abc.html
    // const invoiceTemplatePath = path.join(__dirname, './abc.html');


    const convertDate = (inputDate) => {
      const date = new Date(inputDate);

      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

      const day = String(date.getDate()).padStart(2, '0'); // Get the day with leading zero
      const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
      const year = date.getFullYear();
      const dayName = dayNames[date.getDay()]; // Get the day name

      return `${day}/${month}/${year}(${dayName})`;
    };

    // const inputDate = "Sun Mar 23 2025 22:41:43 GMT+0530 (India Standard Time)";
  
    // const invoiceTemplatePath = path.join(__dirname, '../public/Modern.html');
    const invoiceTemplatePath = path.join(__dirname, '../public/invoiceTable.html');


    const paymentDueDate = new Date(order.createdAt);
    convertDate(paymentDueDate.setDate(paymentDueDate.getDate() + Number(order.paymentTerms)))

    let invoiceHtml = fs.readFileSync(invoiceTemplatePath, 'utf8');



    invoiceHtml = invoiceHtml.replace('VorderNumber', order.orderNumber || '00');
    invoiceHtml = invoiceHtml.replace('VdesignNumber', order.designNumber || 'N/A');
    invoiceHtml = invoiceHtml.replace('VcreatedAt', convertDate(order.createdAt) || 'N/A');
    invoiceHtml = invoiceHtml.replace('VdueDate', convertDate(paymentDueDate) || 'N/A');// due date //VpaymentTerm
    invoiceHtml = invoiceHtml.replace('VourGstNumber', '12564sckuld54sx'); //our gst number
    invoiceHtml = invoiceHtml.replace('VourPanNumber', '152asx61xxs3545'); //our pan number
    invoiceHtml = invoiceHtml.replace('VpaymentTerm', order.paymentTerms || 'N/A');

    invoiceHtml = invoiceHtml.replace('VclintCompanyName', order.companyName || 'N/A');
    invoiceHtml = invoiceHtml.replace('VclintAddress', order.Address || 'N/A');
    invoiceHtml = invoiceHtml.replace('VclintEmail', order.Address || 'N/A'); //
    invoiceHtml = invoiceHtml.replace('VclintPhoneNumber', order.Address || 'N/A'); //
    invoiceHtml = invoiceHtml.replace('VclintGstNumber', order.gstNumber || 'N/A');
    invoiceHtml = invoiceHtml.replace('VclintChallanNumber', order.challanNumber || 'N/A');

    invoiceHtml = invoiceHtml.replace('VorderName', order.orderName || 'N/A');
    invoiceHtml = invoiceHtml.replace('VorderQty', order.quantity || '00');
    invoiceHtml = invoiceHtml.replace('VorderShortPcs', order.shortPcs || '00');
    invoiceHtml = invoiceHtml.replace('VorderShortPcsAmount', (order.shortPcs * order.unitPrice) || '00');

    invoiceHtml = invoiceHtml.replace('VorderUnitRate', order.unitPrice || '00' );
    invoiceHtml = invoiceHtml.replace('VorderDisRate', order.discountRate || '00');
    invoiceHtml = invoiceHtml.replaceAll('VorderTotalCost', order.totalCost || '00');
    invoiceHtml = invoiceHtml.replaceAll('VorderTax', (order.taxPercentage/2) || '00');
    invoiceHtml = invoiceHtml.replaceAll('Vorder-TaxAmount', (order.taxAmount/2) || '00');
    invoiceHtml = invoiceHtml.replace('VorderTotal', order.finalRevenue || '00');
    invoiceHtml = invoiceHtml.replace('VorderSubTotal', (order.totalCost + order.discountAmount) || '00');
    invoiceHtml = invoiceHtml.replace('VorderDiscountAmount', order.discountAmount || '00');
    invoiceHtml = invoiceHtml.replace('VorderFinalRevenue', order.finalRevenue || '00');
    invoiceHtml = invoiceHtml.replace('Vorder-FinalRevenueInWords', numberToWords(order.finalRevenue) || 'Zero Rupees Only');

    res.send(invoiceHtml);
  } catch (error) {
    res.status(500).json({ message: "Error generating invoice", error });
  }
});


// // Accounting Summary
// router.get("/accounting/summary", async (req, res) => {
//     try {
//         const totalRevenue = await Order.aggregate([
//             { $match: { paymentStatus: "paid" } },
//             { $group: { _id: null, total: { $sum: "$totalCost" } } }
//         ]);

//         const totalPending = await Order.aggregate([
//             { $match: { dueAmount: { $gt: 0 } } },
//             { $group: { _id: null, total: { $sum: "$dueAmount" } } }
//         ]);

//         res.json({
//             success: true,
//             totalRevenue: totalRevenue[0]?.total || 0,
//             totalPending: totalPending[0]?.total || 0,
//         });
//     } catch (error) {
//         res.status(500).json({ success: false, message: error.message });
//     }
// });

// router.get("/accounting/summary", async (req, res) => {
//   try {
//     const orders = await Order.find();
//     const totalRevenue = orders.reduce((sum, order) => sum + order.totalCost, 0);
//     const totalPaid = orders.reduce((sum, order) => sum + order.payments.reduce((pSum, p) => pSum + p.amount, 0), 0);
//     const totalPending = totalRevenue - totalPaid;

//     // Categorize orders by payment status
//     const orderStats = {
//       totalOrders: orders.length,
//       paidOrders: orders.filter(order => order.paymentStatus === "Paid").length,
//       partiallyPaidOrders: orders.filter(order => order.paymentStatus === "Partial").length,
//       unpaidOrders: orders.filter(order => order.paymentStatus === "Unpaid").length,
//     };

//     res.json({
//       success: true,
//       totalRevenue,
//       totalPaid,
//       totalPending,
//       orderStats,
//     });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// });

// // Expense vs Profit Tracking
// router.get("/accounting/profit-loss", async (req, res) => {
//   try {
//     const orders = await Order.find();
//     const totalRevenue = orders.reduce((sum, order) => sum + order.totalCost, 0);
//     const totalPaid = orders.reduce((sum, order) => sum + order.payments.reduce((pSum, p) => pSum + p.amount, 0), 0);
//     const totalExpenses = orders.reduce((sum, order) => sum + order.expenses.reduce((eSum, e) => eSum + e.amount, 0), 0);
//     const netProfit = totalRevenue - totalExpenses;

//     res.json({
//       success: true,
//       totalRevenue,
//       totalPaid,
//       totalExpenses,
//       netProfit,
//     });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// });

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