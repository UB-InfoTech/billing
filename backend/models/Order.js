
//for single item only

const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
  amount: { type: Number },
  // date: { type: Date, default: Date.now },
  // createdAt: { type: Date, default: Date.now },
  method: { type: String, enum: ["Cash", "Bank Transfer", "UPI", "Cheque"], default: "Cash" }, // Dropdown
  amountReference: { type: String },
}, { timestamps: true });

const orderSchema = new mongoose.Schema({

  // Personal basic Details
  orderNumber: { type: String }, // invoice number
  challanNumber: { type: String },
  designNumber: { type: String },
  orderName: { type: String },
  Address: { type: String },
  State: { type: String },
  City: { type: String },

  clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
  gstNumber: { type: String, unique: true },
  companyName: { type: String },

  // supplierId: mongoose.Schema.Types.ObjectId,
  // machineId: { type: mongoose.Schema.Types.ObjectId, default: null },
  // machineId: mongoose.Schema.Types.ObjectId,

  designFiles: [String],
  quantity: { type: Number, default: 0 },
  shortPcs: { type: Number, default: 0 }, //return pcs

  orderType: { type: String, enum: ["Custom", "Bulk", "Sample"], default: "Custom" }, // Dropdown
  fabricType: { type: String, enum: ["Cotton", "Silk", "Polyester", "Wool"], default: "Cotton" }, // Dropdown
  priority: { type: String, enum: ["Low", "Medium", "High", "Urgent"], default: "Medium" }, // Dropdown
  status: { type: String, enum: ["Pending", "In Process", "Completed", "Cancelled", "Dispatched"], default: "Pending" }, // Dropdown
  paymentTerms: { type: String, enum: ['30', '60', '90', 'Advance'], default: '30' },

  statusHistory: [
    {
      status: { type: String },
      timestamp: { type: Date, default: Date.now }
    }
  ],
  // tracking: [
  //   {
  //     stage: { type: String },
  //     timestamp: { type: Date, default: Date.now },
  //   },
  // ],
  estimatedCompletion: { type: Date },
  paymentStatus: { type: String, enum: ["Unpaid", "Partial", "Paid"], default: "Unpaid" }, // Dropdown
  // payments: [PaymentSchema],
  payments: [
    {
      _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
      amount: { type: Number },
      date: { type: Date, default: Date.now },
      createdAt: { type: Date, default: Date.now },
      method: { type: String, enum: ["Cash", "Bank Transfer", "UPI", "Cheque"], default: "Cash" }, // Dropdown
      amountReference: { type: String },
    }
  ],
  // expenses: [
  //   {
  //     description: String,
  //     amount: Number,
  //     date: { type: Date, default: Date.now },
  //     category: { type: String, enum: ["Raw Materials", "Labor", "Maintenance", "Other"], default: "Other" }, // Dropdown
  //   }
  // ],
  // qrCode: String,
  unitPrice: { type: Number },
  taxPercentage: { type: Number, default: 5 }, // Dynamic Tax Input
  otherTaxes: { type: Number, default: 0 }, // Other tax fields
  taxAmount: { type: Number },
  discountRate: { type: Number, default: 0 },
  discountAmount: { type: Number },


  totalCost: { type: Number }, // Total after Discount
  paidAmount: { type: Number, default: 0 },
  dueAmount: { type: Number },
  totalAmount: { type: Number },
  finalRevenue: { type: Number }, // totalCost - Tax
  // rawMaterialCost: { type: Number }, // Fabric, thread, dye costs
  // laborCost: { type: Number }, // Wages for workers
  // machineUsageCost: { type: Number }, // Electricity, wear & tear
  netProfit: { type: Number }, // finalRevenue - (all costs)
}, { timestamps: true });

// const Order = mongoose.model("Order", orderSchema);



// Auto Calculate Due Amount & Payment Status Before Saving

// orderSchema.virtual("dueAmount").get(function () {
//   return this.totalCost - this.paidAmount;
// });


orderSchema.pre("findOneAndUpdate", function (next) {

  const update = this.getUpdate();

  // Get current document values
  this.model.findOne(this.getQuery()).then(doc => {
    var quantity = update.quantity || doc.quantity;
    var shortPcs = update.shortPcs || doc.shortPcs;
    var unitPrice = update.unitPrice || doc.unitPrice;
    var discountRate = update.discountRate || doc.discountRate;
    var taxPercentage = update.taxPercentage || doc.taxPercentage;
    var payments = update.payments || doc.payments;

    var totalBaseCost = Number(((quantity - shortPcs) * unitPrice).toFixed(2));
    var discountAmount = Number(((totalBaseCost * discountRate) / 100).toFixed(2));
    var totalCost = totalBaseCost - discountAmount;
    var taxAmount = Number(((totalCost * taxPercentage) / 100).toFixed(2));
    var finalRevenue = totalCost + taxAmount;

    var totalPaid = payments.reduce((sum, payment) =>
      Number(sum) + (Number(payment.amount) || 0), 0);
    var dueAmount = Number((finalRevenue - totalPaid).toFixed(2));

    let paymentStatus;
    if (dueAmount === 0) {
      paymentStatus = "Paid";
    } else if (dueAmount < finalRevenue) {
      paymentStatus = "Partial";
    } else {
      paymentStatus = "Unpaid";
    }

    // Update the fields
    this.setUpdate({
      ...update,
      totalBaseCost,
      discountAmount,
      totalCost,
      taxAmount,
      finalRevenue,
      dueAmount,
      paymentStatus
    });

    next();
  }).catch(err => next(err));
});

orderSchema.pre("save", function (next) {

  const totalBaseCost = Number(((this.quantity - this.shortPcs) * this.unitPrice).toFixed(2));
  this.discountAmount = Number(((totalBaseCost * this.discountRate) / 100).toFixed(2));
  this.totalCost = totalBaseCost - this.discountAmount;
  this.taxAmount = Number(((this.totalCost * this.taxPercentage) / 100).toFixed(2));
  this.finalRevenue = this.totalCost + this.taxAmount;

  var totalPaid = this.payments.reduce((sum, payment) => Number(sum) + (Number(payment.amount) || 0), 0);
  this.dueAmount = Number((this.finalRevenue - totalPaid).toFixed(2));

  // Update Payment Status
  if (this.dueAmount == 0) {
    this.paymentStatus = "Paid";
    this.dueAmount = 0; // Ensure it doesn't go negative
  } else if (this.dueAmount < this.finalRevenue) {
    this.paymentStatus = "Partial";
  } else {
    this.paymentStatus = "Unpaid";
  }

  next();
});

// // 🔹 Middleware to sync Client Model on Payment update
// PaymentSchema.post(["save", "findOneAndUpdate", "findOneAndDelete"], async function (order) {
//   await syncClientData(order.clientId);
// });

// 🟢 Trigger aggregation update after payment is saved
// PaymentSchema.post("save", async function (order) {
//   // await syncClientData(this.clientId);
//   await syncClientData(order.clientId);
// });

// // 🟢 Trigger aggregation update after payment is deleted
// paymentSchema.post("findOneAndDelete", async function (doc) {
//   if (doc) await syncClientData(doc.clientId);
// });

// // 🟢 Trigger aggregation update after payment is updated
// paymentSchema.post("findOneAndUpdate", async function (doc) {
//   if (doc) await syncClientData(doc.clientId);
// });



module.exports = mongoose.model('Order', orderSchema);