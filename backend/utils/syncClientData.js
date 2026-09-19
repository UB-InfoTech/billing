const mongoose = require("mongoose");
const Order = require("../models/Order2");
const Client = require("../models/Client");

const syncClientData = async (clientId) => {
  try {
    const [clientData] = await Order.aggregate([
      // Match stage
      { $match: { clientId: new mongoose.Types.ObjectId(clientId) } },

      // Unwind payments array
      { $unwind: { path: "$payments", preserveNullAndEmptyArrays: true } },

      // Group by order to debug payments per order
      {
        $group: {
          _id: "$_id",
          clientId: { $first: "$clientId" },
          finalRevenue: { $first: "$finalRevenue" },
          createdAt: { $first: "$createdAt" },
          paymentAmount: { $sum: { $ifNull: ["$payments.amount", 0] } },
          paymentsDebug: { $push: "$payments.amount" } // Debug: collect payment amounts
        },
      },

      // Debug intermediate results
      {
        $project: {
          _id: 1,
          clientId: 1,
          finalRevenue: 1,
          createdAt: 1,
          paymentAmount: 1,
          paymentsDebug: 1
        }
      },

      // Group by client
      {
        $group: {
          _id: "$clientId",
          orderCount: { $sum: 1 },
          totalRevenue: { $sum: { $ifNull: ["$finalRevenue", 0] } },
          totalPaid: { $sum: { $ifNull: ["$paymentAmount", 0] } },
          lastOrderDate: { $max: "$createdAt" },
          averageOrderValue: { $avg: { $ifNull: ["$finalRevenue", 0] } },
          payments: { $push: "$_id" },
          // paymentHistory: { $push: "$_id" },
        },
      },

      // Calculate pending payments
      {
        $project: {
          _id: 1,
          orderCount: 1,
          totalRevenue: 1,
          totalPaid: 1,
          pendingPayments: { 
            $subtract: [
              { $ifNull: ["$totalRevenue", 0] },
              { $ifNull: ["$totalPaid", 0] }
            ]
          },
          lastOrderDate: 1,
          averageOrderValue: 1,
          payments: 1
          // paymentHistory: 1
        },
      },
    ]);

    if (!clientData) {
      return { message: "No orders found for client" };
    }

    
    await Client.findByIdAndUpdate(
      clientId,
      {
        $set: {
          orderCount: clientData.orderCount || 0,
          totalRevenue: clientData.totalRevenue || 0,
          totalPaid: clientData.totalPaid || 0,
          pendingPayments: clientData.pendingPayments || 0,
          lastOrderDate: clientData.lastOrderDate || null,
          averageOrderValue: clientData.averageOrderValue || 0,
          payments: clientData.payments || [],
          // paymentHistory: clientData.paymentHistory || [],
        },
      },
      { upsert: true, new: true }
    );

    return clientData;

  } catch (error) {
    console.error("Error syncing client data:", error);
    throw error;
  }
};
module.exports = syncClientData;