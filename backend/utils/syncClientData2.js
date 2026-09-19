const Order = require("../models/Order2");
const Client = require("../models/Client");
const mongoose = require('mongoose');

const clientPaymentAggregation = async (clientId) => {
    const clientData = await Client.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(clientId) } },
      {
        $lookup: {
          from: 'Order',
          localField: '_id',
          foreignField: 'clientId',
          as: 'orders'
        }
      },
      { $unwind: '$orders' },
      {
        $addFields: {
          'orderCount': { $size: '$orders.payments' },
          'totalRevenue': { $sum: '$orders.payments.amount' },
          'lastOrderDate': { $max: '$orders.payments.date' },
          'paymentHistory': '$orders.payments'
        }
      },
      {
        $project: {
          orderCount: 1,
          totalRevenue: 1,
          lastOrderDate: 1,
          paymentHistory: 1,
          outstanding_balance: { $subtract: ['$totalRevenue', '$orders.paidAmount'] }
        }
      }
    ]);
  
    return clientData;
  };
  

  const updateClientPaymentData = async (clientId) => {
    try {
      const updatedClientData = await clientPaymentAggregation(clientId);
  
      await Client.updateOne(
        { _id: mongoose.Types.ObjectId(clientId) },
        {
          $set: {
            orderCount: updatedClientData[0].orderCount,
            totalRevenue: updatedClientData[0].totalRevenue,
            lastOrderDate: updatedClientData[0].lastOrderDate,
            paymentHistory: updatedClientData[0].paymentHistory,
            outstanding_balance: updatedClientData[0].outstanding_balance
          }
        }
      );
    } catch (error) {
      console.error("Error updating client payment data:", error);
    }
  };

  module.exports = updateClientPaymentData;
