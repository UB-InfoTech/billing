// using
const Expense = require('../models/Expense2');

// const { uploadToS3 } = require('../services/ocrService');
// const { convertCurrency } = require('../services/currencyService');
// const { syncWithAccounting } = require('../services/financialSyncService');
// const { suggestCategory } = require('../services/aiService.js'); // Placeholder for AI

// Create Expense

exports.createExpense = async (req, res) => {
  try {
    const {
      description, amount, date, category, paymentMethod, vendor, notes,
      //  currency, clientId, orderId, eventId,
      //  taxDeductible, recurring, recurrenceInterval, recurrenceEndDate
    } = req.body;
    // const {
    //   description, amount,  category, paymentMethod,
    //   vendor 
    // } = req.body;



    // // Currency conversion
    // const exchangeRate = currency !== "INR" ? await convertCurrency(currency, "INR") : 1;
    // const adjustedAmount = amount * exchangeRate;

    // // AI category suggestion (if not provided)
    // const finalCategory = category || (await suggestCategory(vendor, description));

    //   amount: adjustedAmount,
    //   category: finalCategory,
    // const expense = new Expense({
    //   description,
    //   amount,
    //   category,
    //   paymentMethod,
    //   vendor,
    //   createdBy: "Admin",
    //   updatedBy: "Admin",
    // });
    const expense = new Expense({
      description,
      amount,
      date,
      category,
      paymentMethod,
      vendor,
      notes,
      // currency,
      // exchangeRate,
      // clientId,
      // orderId,
      // eventId,
      // taxDeductible,
      // recurring,
      // recurrenceInterval,
      // recurrenceEndDate,
      // createdBy: "Admin",
      // updatedBy: "Admin",

      createdBy: req.user.id
    });

    const savedExpense = await expense.save();

    // Sync with accounting
    // await syncWithAccounting(savedExpense);

    res.status(201).json(savedExpense);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get All Expenses
exports.getExpenses = async (req, res) => {
  try {

    // const { clientId, orderId, category, startDate, endDate } = req.query;
    const { category, startDate, endDate } = req.query;
    const filters = {};
    // if (clientId) filters.clientId = clientId;
    // if (orderId) filters.orderId = orderId;
    if (category) filters.category = category;
    if (startDate || endDate) {
      filters.date = {};
      if (startDate) filters.date.$gte = new Date(startDate);
      if (endDate) filters.date.$lte = new Date(endDate);
    }

    // const expenses = await Expense.find({ createdBy: req.user.id, filters })
    const expenses = await Expense.find({ createdBy: req.user.id });
    // .populate('clientId', 'name')
    // .populate('orderId', 'orderNumber')
    // .populate('eventId', 'title');
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// // Get Expense by ID
// exports.getExpenseById = async (req, res) => {
//   try {
//     const expense = await Expense.findById(req.params.id)
//       .populate('clientId', 'name')
//       .-Medium', 'orderNumber')
//       .populate('eventId', 'title');
//     if (!expense) return res.status(404).json({ message: 'Expense not found' });
//     res.json(expense);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };

// Update Expense
exports.updateExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found' });

    // Object.assign(expense, req.body, { updatedBy: "Admin" });
    Object.assign(expense, req.body);
    const updatedExpense = await expense.save();
    // await syncWithAccounting(updatedExpense);
    res.json(updatedExpense);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete Expense
exports.deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    // await expense.remove();
    res.json({ message: 'Expense deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// // Upload Receipt
// exports.uploadReceipt = async (req, res) => {
//   try {
//     const file = req.file;
//     if (!file) return res.status(400).json({ message: 'No file uploaded' });

//     // const { url, extractedData } = await uploadToS3(file);
//     const { url, extractedData } = file;
//     res.json({ receiptUrl: url, ...extractedData });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };


exports.getExpenseSummary = async (req, res) => {
  try {
    const totalExpense = await Expense.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const categoryBreakdown = await Expense.aggregate([
      { $group: { _id: '$category', total: { $sum: '$amount' } } },
    ]);

    const topExpenses = await Expense.find().sort({ amount: -1 }).limit(5);

    res.json({
      totalExpense: totalExpense[0]?.total || 0,
      categoryBreakdown,
      topExpenses,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error generating summary' });
  }
};
