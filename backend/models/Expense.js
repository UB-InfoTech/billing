const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  title: { type: String, required: true },  // Expense title (e.g., "Machine Repair")
  description: { type: String },            // Details of the expense
  amount: { type: Number, required: true },  // Expense amount
  category: { 
    type: String, 
    enum: ['Production', 'Operational', 'Marketing', 'Financial', 'Miscellaneous'],
    required: true 
  },
  subCategory: { type: String },             // Subcategory (e.g., "Raw Material")
  tags: [{ type: String }],                  // Custom tags (e.g., "urgent", "repair")
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' }, // Optional linkage
  machineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Machine' }, // Machine specific expenses
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },   // Client specific expenses
  date: { type: Date, default: Date.now },    // Date of expense
  isRecurring: { type: Boolean, default: false },  // Recurring expense indicator
  recurringInterval: {                        // Recurrence details (if applicable)
    type: String,
    enum: ['Daily', 'Weekly', 'Monthly', 'Yearly']
  },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },  // Expense recorder
  attachments: [{ type: String }],            // File paths for receipts or invoices
  createdAt: { type: Date, default: Date.now }, // Creation timestamp
  updatedAt: { type: Date, default: Date.now }  // Update timestamp
});

module.exports = mongoose.model('Expense', expenseSchema);
