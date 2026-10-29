const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "billing-integration-tests-only-secret";
const app = require("../server");

const Order = require("../models/Order2");
const Client = require("../models/Client");
const Product = require("../models/Product");
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
      Product.init(),
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

    async function withStandaloneFallback(operation) {
      const originalGetClient = mongoose.connection.getClient;
      mongoose.connection.getClient = () => ({
        topology: {
          description: {
            servers: { simulatedStandalone: { type: "Standalone" } }
          }
        }
      });
      try {
        return await operation();
      } finally {
        mongoose.connection.getClient = originalGetClient;
      }
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

    // Force two independent customer-credit mutations to read the same summary
    // revision. Exactly one may commit against that revision; the other must get
    // a retryable conflict, and persisted credit must match the winning writes.
    const competingClientResponse = await request("/clients", {
      method: "POST",
      body: {
        name: `Concurrent Credit Customer ${suffix}`,
        companyName: `Concurrent Credit Business ${suffix}`,
        phone: "9999999998"
      }
    });
    assert.equal(competingClientResponse.response.status, 201, JSON.stringify(competingClientResponse.payload));
    const competingClientId = competingClientResponse.payload._id;

    const competingInvoiceResponse = await request("/order/orders/create", {
      method: "POST",
      body: {
        clientId: competingClientId,
        orderDate: "2026-10-06T10:30:00.000Z",
        paymentTerms: "30",
        taxPercentage: 10,
        discountRate: 0,
        subOrders: [{
          orderName: "Concurrent credit item",
          qtyUnit: "PCS",
          quantity: 2,
          unitPrice: 10
        }]
      }
    });
    assert.equal(competingInvoiceResponse.response.status, 201, JSON.stringify(competingInvoiceResponse.payload));
    const competingInvoiceId = competingInvoiceResponse.payload.order._id;
    assert.equal(round2(competingInvoiceResponse.payload.order.roundOffFinalRevenue), 22);

    const competingCreditNoteNumber = `RC${suffix}`;
    const originalClientFindOneAndUpdate = Client.findOneAndUpdate;
    let competingClientMutationCalls = 0;
    let releaseCompetingClientMutations;
    const competingClientMutationBarrier = new Promise(resolve => {
      releaseCompetingClientMutations = resolve;
    });
    const barrierFailsafe = setTimeout(() => releaseCompetingClientMutations(), 3000);
    barrierFailsafe.unref?.();

    Client.findOneAndUpdate = function (filter, update) {
      const model = this;
      const args = arguments;
      const isTargetMutation =
        String(filter?._id || "") === String(competingClientId)
        && Number.isFinite(Number(filter?.financialSummaryVersion))
        && competingClientMutationCalls < 2;

      if (!isTargetMutation) return originalClientFindOneAndUpdate.apply(model, args);

      competingClientMutationCalls += 1;
      if (competingClientMutationCalls === 2) releaseCompetingClientMutations();
      return competingClientMutationBarrier.then(() => originalClientFindOneAndUpdate.apply(model, args));
    };

    let competingCreditResults;
    try {
      competingCreditResults = await Promise.all([
        request("/credit-notes", {
          method: "POST",
          body: {
            creditNoteNumber: competingCreditNoteNumber,
            creditNoteDate: "2026-10-06T11:00:00.000Z",
            reason: "Other",
            creditMode: "AMOUNT",
            originalOrderId: competingInvoiceId,
            manualCredit: { taxableAmount: 20, taxRate: 10 },
            settlement: {
              adjustmentType: "Outstanding",
              adjustmentAmount: 0,
              refundAmount: 0,
              customerCreditAmount: 22
            }
          }
        }),
        request(`/clients/${competingClientId}/credit`, {
          method: "PUT",
          body: { amount: 13 }
        })
      ]);
    } finally {
      clearTimeout(barrierFailsafe);
      releaseCompetingClientMutations();
      Client.findOneAndUpdate = originalClientFindOneAndUpdate;
    }

    assert.equal(competingClientMutationCalls, 2, "Both customer-credit mutations must reach the compare-and-set write before either proceeds.");
    const [competingCreditNoteResult, competingManualCreditResult] = competingCreditResults;
    assert.ok(
      [201, 409].includes(competingCreditNoteResult.response.status),
      `Concurrent Credit Note status should be 201 or 409, received ${competingCreditNoteResult.response.status}: ${JSON.stringify(competingCreditNoteResult.payload)}`
    );
    assert.ok(
      [200, 409].includes(competingManualCreditResult.response.status),
      `Concurrent manual credit status should be 200 or 409, received ${competingManualCreditResult.response.status}: ${JSON.stringify(competingManualCreditResult.payload)}`
    );

    const competingNoteSucceeded = competingCreditNoteResult.response.status === 201;
    const competingAdjustmentSucceeded = competingManualCreditResult.response.status === 200;
    assert.ok(competingNoteSucceeded || competingAdjustmentSucceeded, "At least one concurrent credit operation must commit.");

    const [competingClientAfter, competingNotesAfter] = await Promise.all([
      Client.findOne({ _id: competingClientId, createdBy: ownerId })
        .select("creditBalance creditBalanceAdjustment +financialSummaryVersion")
        .lean(),
      CreditNote.find({
        createdBy: ownerId,
        originalOrderId: competingInvoiceId
      }).lean()
    ]);
    const expectedCompetingBalance = (competingNoteSucceeded ? 22 : 0) + (competingAdjustmentSucceeded ? 13 : 0);
    assert.equal(round2(competingClientAfter.creditBalance), expectedCompetingBalance);
    assert.equal(round2(competingClientAfter.creditBalanceAdjustment), competingAdjustmentSucceeded ? 13 : 0);
    assert.equal(competingNotesAfter.length, competingNoteSucceeded ? 1 : 0, "A rejected concurrent Credit Note must not leave an orphan record.");
    if (!competingNoteSucceeded) {
      assert.equal(competingCreditNoteResult.response.status, 409);
    }
    if (!competingAdjustmentSucceeded) {
      assert.equal(competingManualCreditResult.response.status, 409);
    }

    // Two cancellation requests for the same posted Credit Note must not reverse
    // the same customer credit or invoice summary twice.
    const cancellationRaceInvoiceResponse = await request("/order/orders/create", {
      method: "POST",
      body: {
        clientId: competingClientId,
        orderDate: "2026-10-06T12:30:00.000Z",
        paymentTerms: "30",
        taxPercentage: 10,
        discountRate: 0,
        subOrders: [{
          orderName: "Concurrent cancellation item",
          qtyUnit: "PCS",
          quantity: 2,
          unitPrice: 10
        }]
      }
    });
    assert.equal(cancellationRaceInvoiceResponse.response.status, 201, JSON.stringify(cancellationRaceInvoiceResponse.payload));
    const cancellationRaceInvoiceId = cancellationRaceInvoiceResponse.payload.order._id;

    const cancellationRaceNoteResponse = await request("/credit-notes", {
      method: "POST",
      body: {
        creditNoteNumber: `CC${suffix}`,
        creditNoteDate: "2026-10-06T13:00:00.000Z",
        reason: "Other",
        creditMode: "AMOUNT",
        originalOrderId: cancellationRaceInvoiceId,
        manualCredit: { taxableAmount: 20, taxRate: 10 },
        settlement: {
          adjustmentType: "Outstanding",
          adjustmentAmount: 0,
          refundAmount: 0,
          customerCreditAmount: 22
        }
      }
    });
    assert.equal(cancellationRaceNoteResponse.response.status, 201, JSON.stringify(cancellationRaceNoteResponse.payload));
    const cancellationRaceNoteId = cancellationRaceNoteResponse.payload.creditNote._id;

    const originalCancellationFindOneAndUpdate = Client.findOneAndUpdate;
    let cancellationMutationCalls = 0;
    let releaseCancellationMutations;
    const cancellationMutationBarrier = new Promise(resolve => {
      releaseCancellationMutations = resolve;
    });
    const cancellationBarrierFailsafe = setTimeout(() => releaseCancellationMutations(), 3000);
    cancellationBarrierFailsafe.unref?.();

    Client.findOneAndUpdate = function (filter, update) {
      const model = this;
      const args = arguments;
      const isTargetMutation =
        String(filter?._id || "") === String(competingClientId)
        && Number.isFinite(Number(filter?.financialSummaryVersion))
        && cancellationMutationCalls < 2;

      if (!isTargetMutation) return originalCancellationFindOneAndUpdate.apply(model, args);

      cancellationMutationCalls += 1;
      if (cancellationMutationCalls === 2) releaseCancellationMutations();
      return cancellationMutationBarrier.then(() => originalCancellationFindOneAndUpdate.apply(model, args));
    };

    let cancellationRaceResults;
    try {
      cancellationRaceResults = await Promise.all([
        request(`/credit-notes/${cancellationRaceNoteId}/cancel`, {
          method: "POST",
          body: { reason: "Concurrent cancellation attempt A" }
        }),
        request(`/credit-notes/${cancellationRaceNoteId}/cancel`, {
          method: "POST",
          body: { reason: "Concurrent cancellation attempt B" }
        })
      ]);
    } finally {
      clearTimeout(cancellationBarrierFailsafe);
      releaseCancellationMutations();
      Client.findOneAndUpdate = originalCancellationFindOneAndUpdate;
    }

    assert.equal(cancellationMutationCalls, 2, "Both cancellations must reach the credit-balance compare-and-set write.");
    const successfulCancellations = cancellationRaceResults.filter(result => result.response.status === 200);
    assert.equal(successfulCancellations.length, 1, `Exactly one cancellation may succeed; received statuses ${cancellationRaceResults.map(result => result.response.status).join(", ")}.`);
    const rejectedCancellation = cancellationRaceResults.find(result => result.response.status !== 200);
    assert.equal(rejectedCancellation.response.status, 409, JSON.stringify(rejectedCancellation.payload));

    const [cancelledRaceNote, cancellationRaceInvoice, clientAfterCancellationRace] = await Promise.all([
      CreditNote.findOne({ _id: cancellationRaceNoteId, createdBy: ownerId }).lean(),
      Order.findOne({ _id: cancellationRaceInvoiceId, createdBy: ownerId }).lean(),
      Client.findOne({ _id: competingClientId, createdBy: ownerId })
        .select("creditBalance creditBalanceAdjustment +financialSummaryVersion")
        .lean()
    ]);
    assert.equal(cancelledRaceNote.status, "Cancelled");
    assert.equal(cancellationRaceInvoice.creditNoteCount || 0, 0, "The invoice Credit Note count must be reversed only once.");
    assert.equal(round2(clientAfterCancellationRace.creditBalance), expectedCompetingBalance, "The customer credit must be reversed only once.");
    assert.equal(round2(clientAfterCancellationRace.creditBalanceAdjustment), competingAdjustmentSucceeded ? 13 : 0, "Cancellation must not change the independent manual adjustment.");


    // Two overlapping payment requests must not spend the same observed due balance.
    const concurrentInvoiceResponse = await request("/order/orders/create", {
      method: "POST",
      body: {
        clientId,
        orderDate: "2026-10-06T10:00:00.000Z",
        paymentTerms: "30",
        taxPercentage: 0,
        discountRate: 0,
        subOrders: [{
          orderName: "Concurrent payment item",
          qtyUnit: "PCS",
          quantity: 2,
          unitPrice: 100
        }]
      }
    });
    assert.equal(concurrentInvoiceResponse.response.status, 201, JSON.stringify(concurrentInvoiceResponse.payload));
    const concurrentOrderId = concurrentInvoiceResponse.payload.order._id;
    assert.equal(round2(concurrentInvoiceResponse.payload.order.dueAmount), 200);

    const concurrentReferences = [`ITRACEA-${suffix}`, `ITRACEB-${suffix}`];
    const concurrentAttempts = await Promise.all(concurrentReferences.map(reference =>
      request(`/order/orders/${concurrentOrderId}/pay`, {
        method: "POST",
        body: {
          amount: 150,
          method: "UPI",
          amountReference: reference,
          paymentDate: "2026-10-06T11:00:00.000Z"
        }
      })
    ));
    const acceptedAttempts = concurrentAttempts.filter(result => result.response.status === 200);
    assert.equal(
      acceptedAttempts.length,
      1,
      `Exactly one concurrent payment may be accepted; received statuses ${concurrentAttempts.map(result => result.response.status).join(", ")}.`
    );

    const failedAttemptIndex = concurrentAttempts.findIndex(result => result.response.status !== 200);
    assert.notEqual(failedAttemptIndex, -1);
    const persistedConcurrentOrder = await Order.findOne({
      _id: concurrentOrderId,
      createdBy: ownerId
    }).lean();
    assert.equal(persistedConcurrentOrder.payments.length, 1);
    assert.equal(round2(persistedConcurrentOrder.paidAmount), 150);
    assert.equal(round2(persistedConcurrentOrder.dueAmount), 50);
    assert.equal(persistedConcurrentOrder.paymentStatus, "Partial");
    assert.equal(
      await PaymentReference.countDocuments({
        createdBy: ownerId,
        reference: concurrentReferences[failedAttemptIndex]
      }),
      0,
      "A failed concurrent payment must not leave a reserved payment reference."
    );

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

    const paymentId = payment.payload.order.payments[0]._id;
    const editedPaymentReference = `ITPAYEDIT-${suffix}`;
    const editedPayment = await request(`/order/orders/${orderId}/payments/${paymentId}`, {
      method: "PUT",
      body: {
        amount: 70,
        method: "Bank Transfer",
        amountReference: editedPaymentReference,
        paymentDate: "2026-10-02T11:00:00.000Z"
      }
    });
    assert.equal(editedPayment.response.status, 200, JSON.stringify(editedPayment.payload));
    assert.equal(round2(editedPayment.payload.order.paidAmount), 70);
    assert.equal(round2(editedPayment.payload.order.dueAmount), 150);

    const deletedPayment = await request(`/order/orders/${orderId}/payments/${paymentId}`, {
      method: "DELETE"
    });
    assert.equal(deletedPayment.response.status, 200, JSON.stringify(deletedPayment.payload));
    assert.equal(round2(deletedPayment.payload.order.paidAmount), 0);
    assert.equal(round2(deletedPayment.payload.order.dueAmount), 220);
    assert.equal(deletedPayment.payload.order.paymentStatus, "Unpaid");
    assert.equal(deletedPayment.payload.order.payments.length, 0);

    const replacementPayment = await request(`/order/orders/${orderId}/pay`, {
      method: "POST",
      body: {
        amount: 60,
        method: "Cash",
        amountReference: `ITPAYFINAL-${suffix}`,
        paymentDate: "2026-10-02T12:00:00.000Z"
      }
    });
    assert.equal(replacementPayment.response.status, 200, JSON.stringify(replacementPayment.payload));
    assert.equal(round2(replacementPayment.payload.order.dueAmount), 160);

    const secondInvoiceResponse = await request("/order/orders/create", {
      method: "POST",
      body: {
        clientId,
        orderDate: "2026-10-04T10:00:00.000Z",
        paymentTerms: "30",
        taxPercentage: 10,
        discountRate: 0,
        subOrders: [{
          orderName: "Second integration item",
          qtyUnit: "PCS",
          quantity: 1,
          unitPrice: 100
        }]
      }
    });
    assert.equal(secondInvoiceResponse.response.status, 201, JSON.stringify(secondInvoiceResponse.payload));
    const secondOrderId = secondInvoiceResponse.payload.order._id;
    assert.equal(round2(secondInvoiceResponse.payload.order.dueAmount), 110);

    const bulkPaymentReference = `ITBULK-${suffix}`;
    const bulkPayment = await request("/order/orders/payments/bulk", {
      method: "PUT",
      body: {
        method: "UPI",
        amount: 100,
        amountReference: bulkPaymentReference,
        splitType: "custom",
        paymentDate: "2026-10-05T10:00:00.000Z",
        updates: [
          { orderId, amount: 50 },
          { orderId: secondOrderId, amount: 50 }
        ]
      }
    });
    assert.equal(bulkPayment.response.status, 200, JSON.stringify(bulkPayment.payload));
    const bulkOrderOne = await Order.findOne({ _id: orderId, createdBy: ownerId }).lean();
    const bulkOrderTwo = await Order.findOne({ _id: secondOrderId, createdBy: ownerId }).lean();
    assert.equal(round2(bulkOrderOne.paidAmount), 110);
    assert.equal(round2(bulkOrderOne.dueAmount), 110);
    assert.equal(round2(bulkOrderTwo.paidAmount), 50);
    assert.equal(round2(bulkOrderTwo.dueAmount), 60);
    assert.ok(bulkOrderOne.payments.some(item => item.amountReference === bulkPaymentReference));
    assert.ok(bulkOrderTwo.payments.some(item => item.amountReference === bulkPaymentReference));

    const duplicateBulkPayment = await request("/order/orders/payments/bulk", {
      method: "PUT",
      body: {
        method: "UPI",
        amount: 100,
        amountReference: bulkPaymentReference,
        splitType: "custom",
        paymentDate: "2026-10-05T10:00:00.000Z",
        updates: [
          { orderId, amount: 50 },
          { orderId: secondOrderId, amount: 50 }
        ]
      }
    });
    assert.equal(duplicateBulkPayment.response.status, 409, "Bulk payment references must not be reused.");


    // Simulate standalone MongoDB and fail the PaymentLog write after all invoice allocations.
    const fallbackInvoiceOneResponse = await request("/order/orders/create", {
      method: "POST",
      body: {
        clientId,
        orderDate: "2026-10-08T10:00:00.000Z",
        paymentTerms: "30",
        taxPercentage: 0,
        discountRate: 0,
        subOrders: [{ orderName: "Bulk rollback one", qtyUnit: "PCS", quantity: 1, unitPrice: 100 }]
      }
    });
    assert.equal(fallbackInvoiceOneResponse.response.status, 201, JSON.stringify(fallbackInvoiceOneResponse.payload));
    const fallbackInvoiceOneId = fallbackInvoiceOneResponse.payload.order._id;

    const fallbackInvoiceTwoResponse = await request("/order/orders/create", {
      method: "POST",
      body: {
        clientId,
        orderDate: "2026-10-08T11:00:00.000Z",
        paymentTerms: "30",
        taxPercentage: 0,
        discountRate: 0,
        subOrders: [{ orderName: "Bulk rollback two", qtyUnit: "PCS", quantity: 1, unitPrice: 100 }]
      }
    });
    assert.equal(fallbackInvoiceTwoResponse.response.status, 201, JSON.stringify(fallbackInvoiceTwoResponse.payload));
    const fallbackInvoiceTwoId = fallbackInvoiceTwoResponse.payload.order._id;
    const injectedBulkReference = `ITBULKFAIL-${suffix}`;
    const originalPaymentLogSave = PaymentLog.prototype.save;
    let injectedFailureOccurred = false;
    PaymentLog.prototype.save = function (...args) {
      if (this.reference === injectedBulkReference) {
        injectedFailureOccurred = true;
        return Promise.reject(new Error("Injected PaymentLog persistence failure after invoice writes."));
      }
      return originalPaymentLogSave.apply(this, args);
    };

    let failedBulkPayment;
    try {
      failedBulkPayment = await withStandaloneFallback(() => request("/order/orders/payments/bulk", {
        method: "PUT",
        body: {
          method: "UPI",
          amount: 100,
          amountReference: injectedBulkReference,
          splitType: "custom",
          paymentDate: "2026-10-08T12:00:00.000Z",
          updates: [
            { orderId: fallbackInvoiceOneId, amount: 50 },
            { orderId: fallbackInvoiceTwoId, amount: 50 }
          ]
        }
      }));
    } finally {
      PaymentLog.prototype.save = originalPaymentLogSave;
    }

    assert.equal(injectedFailureOccurred, true, "The test must fail after invoice allocations have been written.");
    assert.equal(failedBulkPayment.response.status, 400, JSON.stringify(failedBulkPayment.payload));
    const [fallbackOrderOne, fallbackOrderTwo, orphanBatchLog, failedReservation] = await Promise.all([
      Order.findOne({ _id: fallbackInvoiceOneId, createdBy: ownerId }).lean(),
      Order.findOne({ _id: fallbackInvoiceTwoId, createdBy: ownerId }).lean(),
      PaymentLog.findOne({ userId: ownerId, reference: injectedBulkReference }).lean(),
      PaymentReference.findOne({ createdBy: ownerId, reference: injectedBulkReference }).lean()
    ]);
    for (const order of [fallbackOrderOne, fallbackOrderTwo]) {
      assert.equal(order.payments.length, 0, "Standalone compensation must remove each partial allocation.");
      assert.equal(round2(order.paidAmount), 0);
      assert.equal(round2(order.dueAmount), 100);
      assert.equal(order.paymentStatus, "Unpaid");
    }
    assert.equal(orphanBatchLog, null, "Failed bulk payment must not leave a batch log.");
    assert.equal(failedReservation, null, "Successful compensation must release the payment reference.");

    // The same reference should be reusable after the failed batch was fully compensated.
    const retriedBulkPayment = await withStandaloneFallback(() => request("/order/orders/payments/bulk", {
      method: "PUT",
      body: {
        method: "UPI",
        amount: 100,
        amountReference: injectedBulkReference,
        splitType: "custom",
        paymentDate: "2026-10-08T12:05:00.000Z",
        updates: [
          { orderId: fallbackInvoiceOneId, amount: 50 },
          { orderId: fallbackInvoiceTwoId, amount: 50 }
        ]
      }
    }));
    assert.equal(retriedBulkPayment.response.status, 200, JSON.stringify(retriedBulkPayment.payload));
    const [retriedOrderOne, retriedOrderTwo] = await Promise.all([
      Order.findOne({ _id: fallbackInvoiceOneId, createdBy: ownerId }).lean(),
      Order.findOne({ _id: fallbackInvoiceTwoId, createdBy: ownerId }).lean()
    ]);
    for (const order of [retriedOrderOne, retriedOrderTwo]) {
      assert.equal(order.payments.length, 1);
      assert.equal(round2(order.paidAmount), 50);
      assert.equal(round2(order.dueAmount), 50);
    }

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
    assert.equal(round2(storedOrder.dueAmount), 110, "Customer-credit settlement must not be mistaken for an invoice-due adjustment.");

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

    const secondCreditNoteNumber = `S${suffix}`;
    const secondPosted = await request("/credit-notes", {
      method: "POST",
      body: {
        creditNoteNumber: secondCreditNoteNumber,
        creditNoteDate: "2026-10-03T13:00:00.000Z",
        reason: "Other",
        creditMode: "AMOUNT",
        originalOrderId: orderId,
        manualCredit: { taxableAmount: 10, taxRate: 0 },
        settlement: {
          adjustmentType: "Outstanding",
          adjustmentAmount: 0,
          refundAmount: 10,
          refundMethod: "Cash",
          customerCreditAmount: 0
        }
      }
    });
    assert.equal(secondPosted.response.status, 201, JSON.stringify(secondPosted.payload));
    const secondCreditNoteId = secondPosted.payload.creditNote._id;

    // Editing another posted note to a number already in use must fail without changing any financial records.
    const duplicateEdit = await request(`/credit-notes/${secondCreditNoteId}`, {
      method: "PUT",
      body: {
        creditNoteNumber,
        creditNoteDate: "2026-10-03T13:00:00.000Z",
        reason: "Other",
        creditMode: "AMOUNT",
        manualCredit: { taxableAmount: 10, taxRate: 0 },
        settlement: {
          adjustmentType: "Outstanding",
          adjustmentAmount: 0,
          refundAmount: 10,
          refundMethod: "Cash",
          customerCreditAmount: 0
        }
      }
    });
    assert.equal(duplicateEdit.response.status, 409, JSON.stringify(duplicateEdit.payload));

    let [secondNoteAfterEdit, orderAfterDuplicateEdit, clientAfterDuplicateEdit] = await Promise.all([
      CreditNote.findOne({ _id: secondCreditNoteId, createdBy: ownerId }).lean(),
      Order.findOne({ _id: orderId, createdBy: ownerId }).lean(),
      Client.findOne({ _id: clientId, createdBy: ownerId }).lean()
    ]);
    assert.equal(secondNoteAfterEdit.creditNoteNumber, secondCreditNoteNumber);
    assert.equal(secondNoteAfterEdit.status, "Posted");
    assert.equal(round2(secondNoteAfterEdit.totals.grandTotal), 10);
    assert.equal(orderAfterDuplicateEdit.creditNoteCount, 2);
    assert.equal(round2(clientAfterDuplicateEdit.creditBalance), 76);

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
    assert.equal(storedOrder.creditNoteCount, 1);
    assert.equal(round2(storedOrder.paidAmount), 110);
    assert.equal(round2(storedOrder.dueAmount), 110);

    // Repeated cancellation must be rejected and must not reverse customer credit twice.
    const repeatedCancellation = await request(`/credit-notes/${creditNoteId}/cancel`, {
      method: "POST",
      body: { reason: "Repeated cancellation regression" }
    });
    assert.equal(repeatedCancellation.response.status, 400, JSON.stringify(repeatedCancellation.payload));

    const [clientAfterRepeatedCancel, orderAfterRepeatedCancel, noteAfterRepeatedCancel] = await Promise.all([
      Client.findOne({ _id: clientId, createdBy: ownerId }).lean(),
      Order.findOne({ _id: orderId, createdBy: ownerId }).lean(),
      CreditNote.findOne({ _id: creditNoteId, createdBy: ownerId }).lean()
    ]);
    assert.equal(round2(clientAfterRepeatedCancel.creditBalance), 10);
    assert.equal(round2(clientAfterRepeatedCancel.creditBalanceAdjustment), 10);
    assert.equal(orderAfterRepeatedCancel.creditNoteCount, 1);
    assert.equal(noteAfterRepeatedCancel.status, "Cancelled");

    const cancelledSecond = await request(`/credit-notes/${secondCreditNoteId}/cancel`, {
      method: "POST",
      body: { reason: "Integration test cleanup" }
    });
    assert.equal(cancelledSecond.response.status, 200, JSON.stringify(cancelledSecond.payload));

    storedClient = await Client.findOne({ _id: clientId, createdBy: ownerId }).lean();
    storedOrder = await Order.findOne({ _id: orderId, createdBy: ownerId }).lean();
    assert.equal(round2(storedClient.creditBalance), 10);
    assert.equal(round2(storedClient.creditBalanceAdjustment), 10);
    assert.equal(storedOrder.creditNoteCount, 0);
    assert.equal(round2(storedOrder.paidAmount), 110);
    assert.equal(round2(storedOrder.dueAmount), 110);

    // A late Credit Note failure must roll back earlier stock writes and leave no orphan note.
    const stockProduct = await Product.create({
      productName: `Rollback Product ${suffix}`,
      productCode: `ITROLLBACK-${suffix}`,
      rate: 10,
      quantity: 20,
      createdBy: ownerId
    });
    const stockInvoiceResponse = await request("/order/orders/create", {
      method: "POST",
      body: {
        clientId,
        orderDate: "2026-10-07T10:00:00.000Z",
        paymentTerms: "30",
        taxPercentage: 0,
        discountRate: 0,
        subOrders: [{
          productId: String(stockProduct._id),
          orderName: "Stock rollback item",
          designNumber: "IT-ROLLBACK",
          qtyUnit: "PCS",
          quantity: 2,
          unitPrice: 10
        }]
      }
    });
    assert.equal(stockInvoiceResponse.response.status, 201, JSON.stringify(stockInvoiceResponse.payload));
    const stockInvoiceId = stockInvoiceResponse.payload.order._id;
    const stockSubOrderId = stockInvoiceResponse.payload.order.subOrders[0]._id;
    const stockBeforeFailure = await Product.findOne({ _id: stockProduct._id, createdBy: ownerId }).lean();
    assert.equal(stockBeforeFailure.quantity, 20);

    const duplicateCreditNote = await request("/credit-notes", {
      method: "POST",
      body: {
        creditNoteNumber,
        creditNoteDate: "2026-10-07T12:00:00.000Z",
        reason: "Sales Return",
        creditMode: "ITEM",
        originalOrderId: stockInvoiceId,
        stockAffecting: true,
        items: [{ sourceSubOrderId: stockSubOrderId, quantity: 1 }],
        settlement: {
          adjustmentType: "Outstanding",
          adjustmentAmount: 0,
          refundAmount: 10,
          refundMethod: "Cash",
          customerCreditAmount: 0
        }
      }
    });
    assert.equal(duplicateCreditNote.response.status, 409, JSON.stringify(duplicateCreditNote.payload));


    // Exercise the standalone compensation branch for a failure after the stock increment.
    const standaloneDuplicateCreditNote = await withStandaloneFallback(() => request("/credit-notes", {
      method: "POST",
      body: {
        creditNoteNumber,
        creditNoteDate: "2026-10-07T13:00:00.000Z",
        reason: "Sales Return",
        creditMode: "ITEM",
        originalOrderId: stockInvoiceId,
        stockAffecting: true,
        items: [{ sourceSubOrderId: stockSubOrderId, quantity: 1 }],
        settlement: {
          adjustmentType: "Outstanding",
          adjustmentAmount: 0,
          refundAmount: 10,
          refundMethod: "Cash",
          customerCreditAmount: 0
        }
      }
    }));
    assert.equal(standaloneDuplicateCreditNote.response.status, 409, JSON.stringify(standaloneDuplicateCreditNote.payload));

    const [stockAfterFailure, orderAfterFailure, failedNotes, clientAfterFailure] = await Promise.all([
      Product.findOne({ _id: stockProduct._id, createdBy: ownerId }).lean(),
      Order.findOne({ _id: stockInvoiceId, createdBy: ownerId }).lean(),
      CreditNote.find({ originalOrderId: stockInvoiceId, createdBy: ownerId }).lean(),
      Client.findOne({ _id: clientId, createdBy: ownerId }).lean()
    ]);
    assert.equal(stockAfterFailure.quantity, stockBeforeFailure.quantity, "Stock must roll back when the Credit Note is rejected.");
    assert.equal(orderAfterFailure.creditNoteCount || 0, 0);
    assert.equal(round2(orderAfterFailure.creditAppliedAmount || 0), 0);
    assert.equal(round2(orderAfterFailure.dueAmount), 20);
    assert.equal(failedNotes.length, 0, "Failed Credit Note creation must not leave an orphan record.");
    assert.equal(round2(clientAfterFailure.creditBalance), 10, "A failed stock-return Credit Note must not change customer credit.");


    // Inject a late Credit Note edit failure in standalone mode after stock, customer credit,
    // and invoice summary writes have occurred; compensation must restore all persisted state.
    const standalonePostedNumber = `ST${suffix}`;
    const standalonePosted = await request("/credit-notes", {
      method: "POST",
      body: {
        creditNoteNumber: standalonePostedNumber,
        creditNoteDate: "2026-10-07T14:00:00.000Z",
        reason: "Sales Return",
        creditMode: "ITEM",
        originalOrderId: stockInvoiceId,
        stockAffecting: true,
        items: [{ sourceSubOrderId: stockSubOrderId, quantity: 1 }],
        settlement: {
          adjustmentType: "Outstanding",
          adjustmentAmount: 0,
          refundAmount: 0,
          customerCreditAmount: 10
        },
        note: "Original note value"
      }
    });
    assert.equal(standalonePosted.response.status, 201, JSON.stringify(standalonePosted.payload));
    const standalonePostedId = standalonePosted.payload.creditNote._id;

    let editFailureInjected = false;
    const originalCreditNoteFindOneAndUpdate = CreditNote.findOneAndUpdate;
    CreditNote.findOneAndUpdate = function (filter, update, options) {
      if (
        !editFailureInjected &&
        String(filter?._id) === String(standalonePostedId) &&
        update?.$set?.note === "Injected edit failure"
      ) {
        editFailureInjected = true;
        return Promise.resolve(null);
      }
      return originalCreditNoteFindOneAndUpdate.apply(this, arguments);
    };

    let failedCreditNoteEdit;
    try {
      failedCreditNoteEdit = await withStandaloneFallback(() => request(`/credit-notes/${standalonePostedId}`, {
        method: "PUT",
        body: {
          creditNoteNumber: standalonePostedNumber,
          creditNoteDate: "2026-10-07T15:00:00.000Z",
          reason: "Sales Return",
          creditMode: "ITEM",
          stockAffecting: true,
          items: [{ sourceSubOrderId: stockSubOrderId, quantity: 1 }],
          settlement: {
            adjustmentType: "Outstanding",
            adjustmentAmount: 0,
            refundAmount: 0,
            customerCreditAmount: 10
          },
          note: "Injected edit failure"
        }
      }));
    } finally {
      CreditNote.findOneAndUpdate = originalCreditNoteFindOneAndUpdate;
    }

    assert.equal(editFailureInjected, true, "The edit must fail after earlier financial writes.");
    assert.equal(failedCreditNoteEdit.response.status, 409, JSON.stringify(failedCreditNoteEdit.payload));
    let [noteAfterEditFailure, orderAfterEditFailure, productAfterEditFailure, clientAfterEditFailure] = await Promise.all([
      CreditNote.findOne({ _id: standalonePostedId, createdBy: ownerId }).lean(),
      Order.findOne({ _id: stockInvoiceId, createdBy: ownerId }).lean(),
      Product.findOne({ _id: stockProduct._id, createdBy: ownerId }).lean(),
      Client.findOne({ _id: clientId, createdBy: ownerId }).lean()
    ]);
    assert.equal(noteAfterEditFailure.status, "Posted");
    assert.equal(noteAfterEditFailure.note, "Original note value");
    assert.equal(round2(noteAfterEditFailure.totals.grandTotal), 10);
    assert.equal(orderAfterEditFailure.creditNoteCount, 1);
    assert.equal(round2(orderAfterEditFailure.creditAppliedAmount || 0), 0);
    assert.equal(round2(orderAfterEditFailure.dueAmount), 20);
    assert.equal(productAfterEditFailure.quantity, 21);
    assert.equal(round2(clientAfterEditFailure.creditBalance), 20);
    assert.equal(round2(clientAfterEditFailure.creditBalanceAdjustment), 10);

    // Inject a cancellation write failure after the stock, customer credit, and invoice writes.
    let cancellationFailureInjected = false;
    CreditNote.findOneAndUpdate = function (filter, update, options) {
      if (
        !cancellationFailureInjected &&
        String(filter?._id) === String(standalonePostedId) &&
        update?.$set?.status === "Cancelled"
      ) {
        cancellationFailureInjected = true;
        return Promise.resolve(null);
      }
      return originalCreditNoteFindOneAndUpdate.apply(this, arguments);
    };

    let failedCreditNoteCancellation;
    try {
      failedCreditNoteCancellation = await withStandaloneFallback(() => request(`/credit-notes/${standalonePostedId}/cancel`, {
        method: "POST",
        body: { reason: "Injected cancellation failure" }
      }));
    } finally {
      CreditNote.findOneAndUpdate = originalCreditNoteFindOneAndUpdate;
    }

    assert.equal(cancellationFailureInjected, true, "The cancellation must fail after earlier financial writes.");
    assert.equal(failedCreditNoteCancellation.response.status, 409, JSON.stringify(failedCreditNoteCancellation.payload));
    const [noteAfterCancelFailure, orderAfterCancelFailure, productAfterCancelFailure, clientAfterCancelFailure] = await Promise.all([
      CreditNote.findOne({ _id: standalonePostedId, createdBy: ownerId }).lean(),
      Order.findOne({ _id: stockInvoiceId, createdBy: ownerId }).lean(),
      Product.findOne({ _id: stockProduct._id, createdBy: ownerId }).lean(),
      Client.findOne({ _id: clientId, createdBy: ownerId }).lean()
    ]);
    assert.equal(noteAfterCancelFailure.status, "Posted");
    assert.equal(noteAfterCancelFailure.note, "Original note value");
    assert.equal(orderAfterCancelFailure.creditNoteCount, 1);
    assert.equal(round2(orderAfterCancelFailure.creditAppliedAmount || 0), 0);
    assert.equal(round2(orderAfterCancelFailure.dueAmount), 20);
    assert.equal(productAfterCancelFailure.quantity, 21);
    assert.equal(round2(clientAfterCancelFailure.creditBalance), 20);
    assert.equal(round2(clientAfterCancelFailure.creditBalanceAdjustment), 10);

    const availableCredit = await request(`/credit-notes/available/${orderId}`);
    assert.equal(availableCredit.response.status, 200, JSON.stringify(availableCredit.payload));
    assert.equal(round2(availableCredit.payload.order.previouslyCreditedTotal), 0);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.readyState === 1 && ownerId) {
      await Promise.all([
        CreditNote.deleteMany({ createdBy: ownerId }),
        Order.deleteMany({ createdBy: ownerId }),
        Client.deleteMany({ createdBy: ownerId }),
        Product.deleteMany({ createdBy: ownerId }),
        Profile.deleteMany({ createdBy: String(ownerId) }),
        PaymentReference.deleteMany({ createdBy: ownerId }),
        PaymentLog.deleteMany({ userId: ownerId })
      ]);
    }
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
});
