const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "billing-integration-tests-only-secret";
const app = require("../server");

const Order = require("../models/Order2");
const Client = require("../models/Client");
const Profile = require("../models/Profile");
const CreditNote = require("../models/CreditNote");
const PaymentReference = require("../models/PaymentReference");
const PaymentLog = require("../models/PaymentLog2");
const CreditNoteCounter = require("../models/CreditNoteCounter");

const mongoUri = process.env.MONGO_URI;
const round2 = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

test("invoice, payment, customer credit and Credit Note lifecycle stay consistent in MongoDB", {
  skip: !mongoUri ? "Set MONGO_URI to run MongoDB integration tests." : false
}, async () => {
  let server;
  let ownerId;
  let otherOwnerId;
  let clientId;
  let orderId;
  let creditNoteId;
  let paymentReference;
  let ownerToken;
  let otherOwnerToken;
  let baseUrl;

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
    await Promise.all([
      Order.init(),
      Client.init(),
      Profile.init(),
      CreditNote.init(),
      PaymentReference.init(),
      PaymentLog.init(),
      CreditNoteCounter.init()
    ]);

    ownerId = new mongoose.Types.ObjectId();
    otherOwnerId = new mongoose.Types.ObjectId();
    ownerToken = jwt.sign({ user: { id: String(ownerId) } }, process.env.JWT_SECRET);
    otherOwnerToken = jwt.sign({ user: { id: String(otherOwnerId) } }, process.env.JWT_SECRET);

    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;

    async function request(path, { method = "GET", body, token = ownerToken } = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          "x-auth-token": token,
          ...(body === undefined ? {} : { "content-type": "application/json" })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const text = await response.text();
      let payload;
      try { payload = text ? JSON.parse(text) : null; }
      catch { payload = text; }
      return { response, payload };
    }

    const suffix = crypto.randomBytes(5).toString("hex").toUpperCase();
    paymentReference = `ITPAY-${suffix}`;
    const createdClient = await request("/clients", {
      method: "POST",
      body: {
        name: `Integration Customer ${suffix}`,
        companyName: `Integration Business ${suffix}`,
        phone: "9999999999"
      }
    });
    assert.equal(createdClient.response.status, 201, JSON.stringify(createdClient.payload));
    clientId = createdClient.payload._id;
    assert.ok(clientId);

    const createdInvoice = await request("/order/orders/create", {
      method: "POST",
      body: {
        clientId,
        orderDate: "2026-10-01T10:00:00.000Z",
        paymentTerms: "30",
        taxPercentage: 10,
        discountRate: 0,
        subOrders: [{
          orderName: "Integration fabric",
          designNumber: "IT-DESIGN",
          qtyUnit: "PCS",
          quantity: 2,
          unitPrice: 100
        }]
      }
    });
    assert.equal(createdInvoice.response.status, 201, JSON.stringify(createdInvoice.payload));
    orderId = createdInvoice.payload.order._id;
    assert.equal(round2(createdInvoice.payload.order.roundOffFinalRevenue), 220);
    assert.equal(round2(createdInvoice.payload.order.paidAmount), 0);
    assert.equal(round2(createdInvoice.payload.order.dueAmount), 220);
    assert.equal(createdInvoice.payload.order.paymentStatus, "Unpaid");

    const hiddenInvoice = await request(`/order/orders/${orderId}`, { token: otherOwnerToken });
    assert.equal(hiddenInvoice.response.status, 404, "Invoices must be isolated by business owner.");

    const payment = await request(`/order/orders/${orderId}/pay`, {
      method: "POST",
      body: {
        amount: 60,
        method: "UPI",
        amountReference: paymentReference,
        paymentDate: "2026-10-02T10:00:00.000Z"
      }
    });
    assert.equal(payment.response.status, 200, JSON.stringify(payment.payload));
    assert.equal(round2(payment.payload.order.paidAmount), 60);
    assert.equal(round2(payment.payload.order.dueAmount), 160);
    assert.equal(payment.payload.order.paymentStatus, "Partial");
    assert.equal(payment.payload.order.payments.length, 1);

    const overpayment = await request(`/order/orders/${orderId}/pay`, {
      method: "POST",
      body: { amount: 161, method: "Cash" }
    });
    assert.equal(overpayment.response.status, 400, "Payments above the current due must be rejected.");

    const duplicatePayment = await request(`/order/orders/${orderId}/pay`, {
      method: "POST",
      body: { amount: 1, method: "UPI", amountReference: paymentReference }
    });
    assert.equal(duplicatePayment.response.status, 409, "Payment references must not be reused.");

    const creditNoteNumber = `IT${suffix}`;
    const posted = await request("/credit-notes", {
      method: "POST",
      body: {
        creditNoteNumber,
        creditNoteDate: "2026-10-03T10:00:00.000Z",
        reason: "Other",
        creditMode: "AMOUNT",
        originalOrderId: orderId,
        manualCredit: { taxableAmount: 50, taxRate: 10 },
        settlement: {
          adjustmentType: "Outstanding",
          adjustmentAmount: 0,
          refundAmount: 0,
          customerCreditAmount: 55
        }
      }
    });
    assert.equal(posted.response.status, 201, JSON.stringify(posted.payload));
    creditNoteId = posted.payload.creditNote._id;
    assert.equal(round2(posted.payload.creditNote.totals.grandTotal), 55);
    assert.equal(round2(posted.payload.creditNote.settlement.customerCreditAmount), 55);

    let storedClient = await Client.findOne({ _id: clientId, createdBy: ownerId }).lean();
    let storedOrder = await Order.findOne({ _id: orderId, createdBy: ownerId }).lean();
    assert.equal(round2(storedClient.creditBalance), 55);
    assert.equal(storedOrder.creditNoteCount, 1);
    assert.equal(round2(storedOrder.dueAmount), 160, "Customer-credit settlement must not be mistaken for an invoice-due adjustment.");

    const edited = await request(`/credit-notes/${creditNoteId}`, {
      method: "PUT",
      body: {
        creditNoteNumber,
        creditNoteDate: "2026-10-03T10:00:00.000Z",
        reason: "Other",
        creditMode: "AMOUNT",
        manualCredit: { taxableAmount: 60, taxRate: 10 },
        settlement: {
          adjustmentType: "Outstanding",
          adjustmentAmount: 0,
          refundAmount: 0,
          customerCreditAmount: 66
        }
      }
    });
    assert.equal(edited.response.status, 200, JSON.stringify(edited.payload));
    assert.equal(round2(edited.payload.creditNote.settlement.customerCreditAmount), 66);

    storedClient = await Client.findOne({ _id: clientId, createdBy: ownerId }).lean();
    storedOrder = await Order.findOne({ _id: orderId, createdBy: ownerId }).lean();
    assert.equal(round2(storedClient.creditBalance), 66);
    assert.equal(storedOrder.creditNoteCount, 1);

    const manualAdjustment = await request(`/clients/${clientId}/credit`, {
      method: "PUT",
      body: { amount: 10 }
    });
    assert.equal(manualAdjustment.response.status, 200, JSON.stringify(manualAdjustment.payload));
    assert.equal(round2(manualAdjustment.payload.creditBalance), 76);
    assert.equal(round2(manualAdjustment.payload.creditBalanceAdjustment), 10);

    const cancelled = await request(`/credit-notes/${creditNoteId}/cancel`, {
      method: "POST",
      body: { reason: "Integration test cleanup" }
    });
    assert.equal(cancelled.response.status, 200, JSON.stringify(cancelled.payload));
    assert.equal(cancelled.payload.creditNote.status, "Cancelled");

    storedClient = await Client.findOne({ _id: clientId, createdBy: ownerId }).lean();
    storedOrder = await Order.findOne({ _id: orderId, createdBy: ownerId }).lean();
    assert.equal(round2(storedClient.creditBalance), 10, "Cancellation must preserve the independent manual adjustment.");
    assert.equal(round2(storedClient.creditBalanceAdjustment), 10);
    assert.equal(storedOrder.creditNoteCount, 0);
    assert.equal(round2(storedOrder.paidAmount), 60);
    assert.equal(round2(storedOrder.dueAmount), 160);

    const availableCredit = await request(`/credit-notes/available/${orderId}`);
    assert.equal(availableCredit.response.status, 200, JSON.stringify(availableCredit.payload));
    assert.equal(round2(availableCredit.payload.previouslyCreditedTotal || availableCredit.payload.totalCredited || 0), 0);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.readyState === 1 && ownerId) {
      await Promise.all([
        CreditNote.deleteMany({ createdBy: ownerId }),
        Order.deleteMany({ createdBy: ownerId }),
        Client.deleteMany({ createdBy: ownerId }),
        Profile.deleteMany({ createdBy: String(ownerId) }),
        PaymentReference.deleteMany({ createdBy: ownerId }),
        PaymentLog.deleteMany({ userId: ownerId })
      ]);
    }
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
});
