const express = require('express');
const Order = require('../models/Order2');
const Machine = require('../models/Machine');
const nodemailer = require('nodemailer');
const pdf = require('html-pdf');
const ejs = require('ejs');
const fs = require('fs');
// const { generateInvoicePDF } = require('../utils/invoiceGenerator');
// const { sendAutomatedReport } = require('../utils/automatedReports');
const moment = require('moment');
// import pdf from 'html-pdf';
// import ejs from 'ejs';
// import fs from 'fs';

// import express from 'express';
// import Order from '../models/Order';
// import Machine from '../models/Machine';

const router = express.Router();

// 📌 Get Sales Summary (Daily, Weekly, Monthly Trends)
router.get('/sales-summary', async (req, res) => {
    try {
        const { timeframe, compareTo } = req.query; // daily, weekly, monthly, yearly

        const groupStage =
            timeframe === "daily" ? { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } } :
            timeframe === "monthly" ? { $dateToString: { format: "%Y-%m", date: "$createdAt" } } :
            timeframe === "yearly" ? { $dateToString: { format: "%Y", date: "$createdAt" } } :
            { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };

        const salesData = await Order.aggregate([
            { $match: { paymentStatus: "Paid" } },
            { $group: { _id: groupStage, totalRevenue: { $sum: "$totalCost" }, orderCount: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        res.json(salesData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📌 Advanced Sales & Revenue Reports API
router.get('/sales-report', async (req, res) => {
    try {
        const { timeframe } = req.query; // daily, weekly, monthly
        let dateFilter = {};

        if (timeframe === 'daily') {
            dateFilter = { createdAt: { $gte: moment().startOf('day').toDate() } };
        } else if (timeframe === 'weekly') {
            dateFilter = { createdAt: { $gte: moment().startOf('week').toDate() } };
        } else if (timeframe === 'monthly') {
            dateFilter = { createdAt: { $gte: moment().startOf('month').toDate() } };
        }

        const salesData = await Order.aggregate([
            { $match: dateFilter },
            // { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, totalRevenue: { $sum: "$totalAmount" } } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, totalRevenue: { $sum: "$totalCost" } } },
            { $sort: { _id: 1 } }
        ]);

        res.json({ success: true, salesData });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Error fetching sales report" });
    }
});

// 📌 Get Machine Performance Data
router.get('/machine-performance', async (req, res) => {
    try {
        const machineData = await Machine.find({}, { name: 1, totalOrdersProcessed: 1, totalRevenueGenerated: 1, downtimeHours: 1 });
        res.json(machineData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📌 Get Client-Wise Revenue Analysis
router.get('/client-revenue', async (req, res) => {
    try {
        const clientRevenue = await Order.aggregate([
            { $match: { paymentStatus: "Paid" } },
            { $group: { _id: "$clientId", totalRevenue: { $sum: "$totalCost" }, orderCount: { $sum: 1 } } },
            { $sort: { totalRevenue: -1 } },
            { $lookup: { from: "clients", localField: "_id", foreignField: "_id", as: "clientDetails" } },
            { $unwind: "$clientDetails" },
            { $project: { clientName: "$clientDetails.name", totalRevenue: 1, orderCount: 1 } }
        ]);

        res.json(clientRevenue);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📌 Get Profit Analysis (Revenue vs. Costs vs. Net Profit)
router.get('/profit-analysis', async (req, res) => {
    try {
        const profitData = await Order.aggregate([
            { $project: {
                orderId: 1,
                revenue: "$totalCost",
                rawMaterialCost: 1,
                laborCost: 1,
                machineUsageCost: 1,
                netProfit: { $subtract: ["$totalCost", { $add: ["$rawMaterialCost", "$laborCost", "$machineUsageCost"] }] }
            }},
            { $sort: { netProfit: -1 } }
        ]);

        res.json(profitData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📌 Get Region-Based Sales Report
router.get('/sales-by-region', async (req, res) => {
    try {
        const regionData = await Order.aggregate([
            { $match: { paymentStatus: "Paid" } },
            { $group: { _id: "$location", totalRevenue: { $sum: "$totalCost" }, orderCount: { $sum: 1 } } },
            { $sort: { totalRevenue: -1 } }
        ]);

        res.json(regionData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📌 Get Top-Selling Saree Types & Designs
router.get('/top-selling-sarees', async (req, res) => {
    try {
        const sareeSales = await Order.aggregate([
            // { $unwind: "$sareeTypes" },
            // { $group: { _id: "$sareeTypes", totalSold: { $sum: 1 }, totalRevenue: { $sum: "$totalCost" } } },
            { $unwind: "$fabricType" },
            { $group: { _id: "$fabricType", totalSold: { $sum: 1 }, totalRevenue: { $sum: "$totalCost" } } },
            { $sort: { totalSold: -1 } },
            { $limit: 10 }
        ]);

        res.json(sareeSales);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📌 Automated Invoice Generation API
router.post('/generate-invoice', async (req, res) => {
    try {
        const { orderId } = req.body;
        const order = await Order.findById(orderId).populate('client');
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });
        
        const invoiceData = { orderId: order._id, client: order.client, totalAmount: order.totalAmount, createdAt: new Date() };
        const newInvoice = await Invoice.create(invoiceData);
        await generateInvoicePDF(newInvoice); // Generate and save invoice PDF
        res.json({ success: true, message: "Invoice generated successfully", invoice: newInvoice });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Error generating invoice" });
    }
});

// 📌 Automated Reporting API
router.get('/send-reports', async (req, res) => {
    try {
        const { email } = req.query;
        await sendAutomatedReport(email);
        res.json({ success: true, message: `Automated report sent to ${email}` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Error sending report" });
    }
});

// 📌 Supplier Performance Insights API
router.get('/supplier-performance', async (req, res) => {
    try {
        const supplierData = await Supplier.aggregate([
            { $lookup: { from: 'orders', localField: '_id', foreignField: 'supplier', as: 'orders' } },
            { $project: { name: 1, totalOrders: { $size: "$orders" }, onTimeDeliveries: { $sum: { $cond: [ { $lte: ["$orders.deliveryTime", "$orders.expectedDeliveryTime"] }, 1, 0 ] } } } },
            { $sort: { onTimeDeliveries: -1 } }
        ]);
        res.json({ success: true, supplierData });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Error fetching supplier performance" });
    }
});


// 📌 Automated Report Generation (PDF & Email)
router.post('/generate-report', async (req, res) => {
    try {
        const { email, timeframe } = req.body;

       // Fetch Sales Data
        const salesData = await Order.aggregate([
            { $match: { paymentStatus: "Paid" } },
            { $group: { _id: "$createdAt", totalRevenue: { $sum: "$totalCost" } } },
            { $sort: { _id: 1 } }
        ]);

        // res.json(salesData);
        // Generate HTML from EJS Template
        const htmlTemplate = fs.readFileSync("./templates/report.ejs", "utf-8");
        const renderedHtml = ejs.render(htmlTemplate, { salesData, timeframe });

        // Generate PDF
        pdf.create(renderedHtml).toFile("./reports/sales_report.pdf", async (err, result) => {
            if (err) return res.status(500).json({ error: err.message });

            // Send Email with Report Attachment
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
            });

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: `Sales Report - ${timeframe}`,
                text: "Please find the attached sales report.",
                attachments: [{ filename: "sales_report.pdf", path: "./reports/sales_report.pdf" }]
            };

            await transporter.sendMail(mailOptions);

            res.json({ message: "Report generated and sent successfully!" });
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// export default router;

module.exports = router;
