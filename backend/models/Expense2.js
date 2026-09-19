const mongoose = require('mongoose');

const ExpenseSchema = new mongoose.Schema({
  description: { type: String },
  amount: { type: Number, min: 0 },
  date: { type: Date, default: Date.now },
  category: { 
    type: String, 
    // enum: ["Raw Materials", "Labor", "Maintenance", "Shipping", "Utilities", "Marketing", "Rent", "Other"], 
    default: "Other" 
  },
  // subCategory: { type: String },
  paymentMethod: { 
    type: String, 
    // enum: ["Cash", "Bank Transfer", "UPI", "Cheque", "Credit"], 
    default: "Cash" 
  },
  // currency: { type: String, default: "INR" },
  // exchangeRate: { type: Number, default: 1 },
  // clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
  // orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
  // eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event" },
  // receiptUrl: { type: String },
  vendor: { type: String },
  // taxDeductible: { type: Boolean, default: false },
  notes: { type: String },
  // status: { 
  //   type: String, 
  //   enum: ["Pending", "Approved", "Reimbursed"], 
  //   default: "Approved" 
  // },
  createdBy: { type: String, default: "Admin" },
  // updatedBy: { type: String, default: "Admin" },
  // recurring: { type: Boolean, default: false },
  // recurrenceInterval: { 
  //   type: String, 
  //   enum: ["Daily", "Weekly", "Monthly", "Yearly"] 
  // },
  // recurrenceEndDate: { type: Date },3
  gstNo: { type: String },
}, { timestamps: true });

module.exports = mongoose.model("Expense2", ExpenseSchema);