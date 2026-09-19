const express = require('express');
const Supplier = require('../models/Supplier');
const router = express.Router();

// Create Supplier
router.post('/', async (req, res) => {
  try {
    const supplier = new Supplier(req.body);
    await supplier.save();
    res.status(201).json(supplier);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Get All Suppliers
router.get('/', async (req, res) => {
  try {
    const suppliers = await Supplier.find();
    res.json(suppliers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get Supplier by ID
router.get('/:id', async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    res.json(supplier);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update Supplier
router.put('/:id', async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    res.json(supplier);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete Supplier
router.delete('/:id', async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndDelete(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    res.json({ message: 'Supplier deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update Supplier Credit Tracking
router.put('/:id/credit', async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || isNaN(amount)) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    supplier.credit_due += parseFloat(amount);
    await supplier.save();
    res.json(supplier);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

  // Search & Filter Suppliers
  router.get('/search', async (req, res) => {
    try {
      const { name, gstin, credit_due } = req.query;
      const query = {};
      if (name) query.name = { $regex: name, $options: 'i' };
      if (gstin) query.gstin = gstin;
      if (credit_due) query.credit_due = { $gte: credit_due };
  
      const suppliers = await Supplier.find(query);
      res.json(suppliers);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // Get Supplier Performance Analytics
router.get('/:id/performance', async (req, res) => {
    try {
      const supplier = await Supplier.findById(req.params.id);
      if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
      
      const performance = {
        totalOrders: supplier.orders.length,
        avgDeliveryTime: supplier.orders.reduce((acc, order) => acc + order.deliveryTime, 0) / supplier.orders.length || 0,
      };
      res.json(performance);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  
module.exports = router;