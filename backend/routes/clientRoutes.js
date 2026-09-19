// change 03/08/2025
const express = require('express');
const Client = require('../models/Client');
const router = express.Router();
const axios = require('axios');
const auth = require('../middleware/auth');

// Get All Clients
router.get('/', auth, async (req, res) => {
// router.get('/', async (req, res) => {
    try {
        const clients = await Client.find({ createdBy: req.user.id });
        res.json(clients);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get Client by ID
router.get('/:id', auth , async (req, res) => {
// router.get('/:id', async (req, res) => {
    try {
        // const client = await Client.findById(req.params.id);
        const client = await Client.findById({ _id: req.params.id, createdBy: req.user.id });
         // Check if the client exists and belongs to the authenticated user
        if (!client) return res.status(404).json({ message: 'Client not found' });
        res.json(client);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Update Client
// router.put('/:id', async (req, res) => {
router.patch('/:id', async (req, res) => {
    try {
        const client = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!client) return res.status(404).json({ message: 'Client not found' });
        res.json(client);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Delete Client
router.delete('/:id', async (req, res) => {
    try {
        const client = await Client.findByIdAndDelete(req.params.id);
        if (!client) return res.status(404).json({ message: 'Client not found' });
        res.json({ message: 'Client deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// Create Client with GST Verification
router.post('/', auth, async (req, res) => {
// router.post('/', async (req, res) => {
  try {
    // const client = new Client({ name, gstin, contact, credit_limit, balance_due: balance_due || 0 });
    const client = new Client({ ...req.body, createdBy: req.user.id });
    await client.save();
    res.status(201).json(client);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update Credit & Balance Due
router.put('/:id/credit', async (req, res) => {
    try {
        const { amount } = req.body;
        const client = await Client.findById(req.params.id);
        if (!client) return res.status(404).json({ message: 'Client not found' });

        client.balance_due += amount;
        await client.save();
        res.json(client);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Search & Filter Clients
router.get('/search', async (req, res) => {
    try {
        const { name, gstin, balance_due } = req.query;
        const query = {};
        if (name) query.name = { $regex: name, $options: 'i' };
        if (gstin) query.gstin = gstin;
        if (balance_due) query.balance_due = { $gte: balance_due };

        const clients = await Client.find(query);
        res.json(clients);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get Client Transaction History
router.get('/:id/transactions', async (req, res) => {
    try {
        const client = await Client.findById(req.params.id).populate('transactions');
        if (!client) return res.status(404).json({ message: 'Client not found' });
        res.json(client.transactions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;