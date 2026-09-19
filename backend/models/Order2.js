//for multiple items only
//total cost ne sum of total price kar va ni che
const mongoose = require('mongoose');

// const SubOrderSchema = new mongoose.Schema({
//     designNumber: String,
//     orderName: String,
//     quantity: Number,
//     unitPrice: Number,
//     shortPcs: Number,
// });
// // }, { timestamps: true });


const orderSchema = new mongoose.Schema({

    orderNumber: { type: String }, // invoice number
    challanNumber: { type: String },
    lrNo: { type: String }, // Lr No
    orderDate: { type: Date, default: Date.now },
    //   designNumber: { type: String },
    //   orderName: { type: String },

    // subOrders: [SubOrderSchema],
    subOrders: [
        {
            designNumber: String,
            orderName: String,
            hsnCode: Number,
            qtyUnit: String,
            quantity: Number,
            cut: Number,
            MTR: Number,
            unitPrice: Number,
            shortPcs: Number,
        }
    ],

    Address: { type: String },
    State: { type: String },
    City: { type: String },
    pinCode: { type: String },
    stateCode: { type: String },

    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
    gstNumber: { type: String },
    companyName: { type: String },

    // designFiles: [String],
    //   quantity: { type: Number, default: 0 },
    //   shortPcs: { type: Number, default: 0 }, //return pcs

    //   orderType: { type: String, enum: ["Custom", "Bulk", "Sample"], default: "Custom" }, // Dropdown
    //   fabricType: { type: String, enum: ["Cotton", "Silk", "Polyester", "Wool"], default: "Cotton" }, // Dropdown
    //   priority: { type: String, enum: ["Low", "Medium", "High", "Urgent"], default: "Medium" }, // Dropdown
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
    //   estimatedCompletion: { type: Date },
    paymentStatus: { type: String, enum: ["Unpaid", "Partial", "Paid"], default: "Unpaid" }, // Dropdown
    // payments: [PaymentSchema],
    payments: [
        {
            _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
            amount: { type: Number },
            paymentDate: { type: Date },
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

    //   unitPrice: { type: Number },
    taxPercentage: { type: Number, default: 5 }, // Dynamic Tax Input
    //   otherTaxes: { type: Number, default: 0 }, // Other tax fields
    taxAmount: { type: Number },
    discountRate: { type: Number, default: 0 },
    discountAmount: { type: Number },


    totalCost: { type: Number }, // Total after Discount // sum of total price 
    paidAmount: { type: Number, default: 0 },
    dueAmount: { type: Number },
    totalAmount: { type: Number },
    finalRevenue: { type: Number }, // totalCost - Tax
    roundOffFinalRevenue: { type: Number }, // after roundOff finalRevenue
    note: { type: String },

    // rawMaterialCost: { type: Number }, // Fabric, thread, dye costs
    // laborCost: { type: Number }, // Wages for workers
    // machineUsageCost: { type: Number }, // Electricity, wear & tear
    netProfit: { type: Number }, // finalRevenue - (all costs)
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    ewbDetails: {
        ewbNo: { type: String },
        ewbDate: { type: String },
        validTill: { type: String },
        alert: { type: String },
        status: {
            type: String,
            // enum: ['generated', 'cancelled'],
            default: null,
        }
    },

}, { timestamps: true });



// Auto Calculate Due Amount & Payment Status Before Saving

// orderSchema.virtual("dueAmount").get(function () {
//   return this.totalCost - this.paidAmount;
// });


orderSchema.pre("findOneAndUpdate", function (next) {

    const update = this.getUpdate();

    // Get current document values
    this.model.findOne(this.getQuery()).then(doc => {
        // var quantity = update.quantity || doc.quantity;
        // var shortPcs = update.shortPcs || doc.shortPcs;
        // var unitPrice = update.unitPrice || doc.unitPrice;
        var subOrders = update.subOrders || doc.subOrders || [];
        var discountRate = update.discountRate || doc.discountRate;
        var taxPercentage = update.taxPercentage || doc.taxPercentage;
        var payments = update.payments || doc.payments;

        var totalBaseCost = subOrders.reduce((total, sub) => {

            const qtyUnit = sub.qtyUnit || "PCS";
            const mtr = sub.MTR || 0;
            const qty = sub.quantity || 0;
            const short = sub.shortPcs || 0;
            const unitPrice = sub.unitPrice || 0;
            if (qtyUnit === "MTR") {
                return total + ((mtr - short) * unitPrice);
            } else {
                return total + ((qty - short) * unitPrice);
            }
            // return (total + ((qty - short) * unitPrice));
        }, 0);

        // var totalBaseCost = Number(((quantity - shortPcs) * unitPrice).toFixed(2));
        var discountAmount = Number(((totalBaseCost * discountRate) / 100).toFixed(2));
        var totalCost = totalBaseCost - discountAmount;

        var taxAmount = Number(((totalCost * taxPercentage) / 100).toFixed(2));
        var finalRevenue = totalCost + taxAmount;
        var roundOffFinalRevenue = Math.round(finalRevenue);

        var totalPaid = payments.reduce((sum, payment) =>
            Number(sum) + (Number(payment.amount) || 0), 0);
        // var dueAmount = Number((finalRevenue - totalPaid).toFixed(2));
        var dueAmount = Number((roundOffFinalRevenue - totalPaid).toFixed(2));

        let paymentStatus;
        if (dueAmount === 0) {
            paymentStatus = "Paid";
        } else if (dueAmount < roundOffFinalRevenue) {
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
            roundOffFinalRevenue,
            dueAmount,
            paymentStatus
        });

        next();
    }).catch(err => next(err));
});

orderSchema.pre("save", function (next) {

    const totalBaseCost = this.subOrders.reduce((total, sub) => {
        const qtyUnit = sub.qtyUnit || "PCS";
        const mtr = sub.MTR || 0;
        const qty = sub.quantity || 0;
        const short = sub.shortPcs || 0;
        const price = sub.unitPrice || 0;
        if (qtyUnit === "MTR") {
            return total + ((mtr - short) * price);
        } else {
            return total + ((qty - short) * price);
        }
        // return total + ((qty - short) * price);
    }, 0);


    // const totalBaseCost = Number(((this.quantity - this.shortPcs) * this.unitPrice).toFixed(2));
    this.discountAmount = Number(((totalBaseCost * this.discountRate) / 100).toFixed(2));
    this.totalCost = Number(totalBaseCost - this.discountAmount).toFixed(2);
    this.taxAmount = Number(((this.totalCost * this.taxPercentage) / 100).toFixed(2));
    this.finalRevenue = this.totalCost + this.taxAmount;
    this.roundOffFinalRevenue = Math.round(this.finalRevenue);

    // Calculate Due Amount 
    var totalPaid = this.payments.reduce((sum, payment) => Number(sum) + (Number(payment.amount) || 0), 0);
    this.dueAmount = Number((this.roundOffFinalRevenue - totalPaid).toFixed(2));
    // this.dueAmount = Number((this.finalRevenue - totalPaid).toFixed(2));

    // Update Payment Status
    if (this.dueAmount == 0) {
        this.paymentStatus = "Paid";
        this.dueAmount = 0; // Ensure it doesn't go negative
    } else if (this.dueAmount < this.roundOffFinalRevenue) {
        this.paymentStatus = "Partial";
    } else {
        this.paymentStatus = "Unpaid";
    }

    next();
});


module.exports = mongoose.model('Order2', orderSchema);