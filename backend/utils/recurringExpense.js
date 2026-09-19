const cron = require('node-cron');
const Expense = require('../models/Expense');

const setupRecurringExpenses = () => {
  cron.schedule('0 0 * * *', async () => { // Runs daily at midnight
    const recurringExpenses = await Expense.find({ recurring: true, recurrenceEndDate: { $gte: new Date() } });
    for (const expense of recurringExpenses) {
      const newExpense = new Expense({
        ...expense.toObject(),
        _id: undefined, // New ID for each instance
        date: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await newExpense.save();
    }
  });
};

module.exports = setupRecurringExpenses;