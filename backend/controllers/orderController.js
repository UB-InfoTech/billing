const Order = require('../models/Order2');
const { json } = require('express');
const mongoose = require('mongoose');

exports.getSalesAnalytics = async (req, res) => {
  try {
    const now = new Date(); // Current date (March 20, 2025)
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())); // Start of current week (Sunday)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1); // Start of current month
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1); // Start of yesterday
    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7); // Start of previous week
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1); // Start of previous month
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0); // End of previous month

    const reqUserId = req.user.id;
    
    // Aggregation pipeline for sales data
    const salesData = await Order.aggregate([

      // Match only completed orders (assuming sales = completed orders)
      //   { $match: { status: "Completed" } },
      // { $match:{ createdBy : reqUserId } },
      { $match: { createdBy: new mongoose.Types.ObjectId(req.user.id) } },
      {
        $facet: {
          today: [
            // { $match: { createdAt: { $gte: startOfToday } } },
            { $match: { orderDate: { $gte: startOfToday } } },
           
            // { $group: { _id: null, totalSales: { $sum: '$totalCost' }, orders: { $push: '$$ROOT' } } },
            { $group: { _id: null, totalSales: { $sum: '$finalRevenue' }, orders: { $push: '$$ROOT' } } },
          ],
          thisWeek: [
            { $match: { orderDate: { $gte: startOfWeek } } },
            { $group: { _id: null, totalSales: { $sum: '$finalRevenue' }, orders: { $push: '$$ROOT' } } },
          ],
          thisMonth: [
            { $match: { orderDate: { $gte: startOfMonth } } },
            { $group: { _id: null, totalSales: { $sum: '$finalRevenue' }, orders: { $push: '$$ROOT' } } },
          ],
          yesterday: [
            { $match: { orderDate: { $gte: startOfYesterday, $lt: startOfToday } } },
            { $group: { _id: null, totalSales: { $sum: '$finalRevenue' }, orders: { $push: '$$ROOT' } } },
          ],
          lastWeek: [
            { $match: { orderDate: { $gte: startOfLastWeek, $lt: startOfWeek } } },
            { $group: { _id: null, totalSales: { $sum: '$finalRevenue' }, orders: { $push: '$$ROOT' } } },
          ],
          lastMonth: [
            { $match: { orderDate: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
            { $group: { _id: null, totalSales: { $sum: '$finalRevenue' }, orders: { $push: '$$ROOT' } } },
          ],
        },
      },
    ]);

    // Clean up the response
    const response = {
      today: {
        totalSales: salesData[0].today[0]?.totalSales || 0,
        orderCount: salesData[0].today[0]?.orders.length || 0,
        orders: salesData[0].today[0]?.orders || [],
      },
      thisWeek: {
        totalSales: salesData[0].thisWeek[0]?.totalSales || 0,
        orderCount: salesData[0].thisWeek[0]?.orders.length || 0,
        orders: salesData[0].thisWeek[0]?.orders || [],
      },
      thisMonth: {
        totalSales: salesData[0].thisMonth[0]?.totalSales || 0,
        orderCount: salesData[0].thisMonth[0]?.orders.length || 0,
        orders: salesData[0].thisMonth[0]?.orders || [],
      },
      yesterday: {
        totalSales: salesData[0].yesterday[0]?.totalSales || 0,
        orderCount: salesData[0].yesterday[0]?.orders.length || 0,
        orders: salesData[0].yesterday[0]?.orders || [],
      },
      lastWeek: {
        totalSales: salesData[0].lastWeek[0]?.totalSales || 0,
        orderCount: salesData[0].lastWeek[0]?.orders.length || 0,
        orders: salesData[0].lastWeek[0]?.orders || [],
      },
      lastMonth: {
        totalSales: salesData[0].lastMonth[0]?.totalSales || 0,
        orderCount: salesData[0].lastMonth[0]?.orders.length || 0,
        orders: salesData[0].lastMonth[0]?.orders || [],
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find({ createdBy: req.user.id }, 'orderName orderNumber finalRevenue orderDate status Address State City');
    // const orders = await Order.find({}, 'orderName orderNumber finalRevenue createdAt status Address State City');
    res.status(200).json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
