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
const FinancialRecoveryIssue = require("../models/FinancialRecoveryIssue");

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
      CreditNoteCounter.init(),
      FinancialRecoveryIssue.init()
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

    // A saved payment must remain successful when the derived customer totals
    // cannot be refreshed. The issue stays open until a real refresh succeeds.
    const summaryRecoveryCustomerResponse = await request("/clients", {
      method: "POST",
      body: {
        name: "Summary Recovery Customer " + suffix,
        companyName: "Summary Recovery Business " + suffix,
        phone: "9999999997"
      }
    });
    assert.equal(summaryRecoveryCustomerResponse.response.status, 201, JSON.stringify(summaryRecoveryCustomerResponse.payload));
    const summaryRecoveryClientId = summaryRecoveryCustomerResponse.payload._id;

    const summaryRecoveryInvoiceResponse = await request("/order/orders/create", {
      method: "POST",
      body: {
        clientId: summaryRecoveryClientId,
        orderDate: "2026-10-01T11:00:00.000Z",
        paymentTerms: "30",
        taxPercentage: 0,
        discountRate: 0,
        subOrders: [{
          orderName: "Summary recovery item",
          qtyUnit: "PCS",
          quantity: 2,
          unitPrice: 10
        }]
      }
    });
    assert.equal(summaryRecoveryInvoiceResponse.response.status, 201, JSON.stringify(summaryRecoveryInvoiceResponse.payload));
    const summaryRecoveryInvoiceId = summaryRecoveryInvoiceResponse.payload.order._id;

    const originalSummaryClientFindOneAndUpdate = Client.findOneAndUpdate;
    let failedSummaryWrites = 0;
    Client.findOneAndUpdate = function (filter, update, options) {
      if (
        String(filter?._id || "") === String(summaryRecoveryClientId)
        && update?.$set
        && Object.prototype.hasOwnProperty.call(update.$set, "financialSummaryVersion")
      ) {
        failedSummaryWrites += 1;
        return { lean: () => Promise.resolve(null) };
      }
      return originalSummaryClientFindOneAndUpdate.apply(this, arguments);
    };

    let summaryRecoveryPayment;
    let summaryRecoveryIssue;
    try {
      summaryRecoveryPayment = await request("/order/orders/" + summaryRecoveryInvoiceId + "/pay", {
        method: "POST",
        body: {
          amount: 5,
          method: "UPI",
          amountReference: "ITSUMMARY-" + suffix,
          paymentDate: "2026-10-01T12:00:00.000Z"
        }
      });
      assert.equal(summaryRecoveryPayment.response.status, 200, JSON.stringify(summaryRecoveryPayment.payload));
      assert.equal(round2(summaryRecoveryPayment.payload.order.paidAmount), 5);
      assert.ok(failedSummaryWrites >= 2, "The customer summary write must be forced to fail through the automatic retries.");

      const openSummaryIssues = await request("/financial-recovery-issues?status=Open");
      assert.equal(openSummaryIssues.response.status, 200, JSON.stringify(openSummaryIssues.payload));
      summaryRecoveryIssue = openSummaryIssues.payload.issues.find(issue =>
        issue.operation === "customer-summary-sync"
        && (issue.clientIds || []).some(id => String(id) === String(summaryRecoveryClientId))
      );
      assert.ok(summaryRecoveryIssue, "A failed customer summary refresh must create a durable recovery issue.");
      assert.equal(summaryRecoveryIssue.status, "Open");

      const hiddenSummaryIssue = await request("/financial-recovery-issues?status=All", { token: otherOwnerToken });
      assert.equal(hiddenSummaryIssue.response.status, 200);
      assert.equal(hiddenSummaryIssue.payload.issues.some(issue => String(issue._id) === String(summaryRecoveryIssue._id)), false);

      const unsafeManualResolve = await request("/financial-recovery-issues/" + summaryRecoveryIssue._id + "/resolve", {
        method: "PATCH",
        body: { resolutionNote: "The payment itself was recorded successfully." }
      });
      assert.equal(unsafeManualResolve.response.status, 409, "A customer-summary issue must not be closed by a manual note alone.");

      const hiddenSummaryRetry = await request("/financial-recovery-issues/" + summaryRecoveryIssue._id + "/retry-customer-sync", {
        method: "POST",
        token: otherOwnerToken
      });
      assert.equal(hiddenSummaryRetry.response.status, 404, "Customer summary recovery must be owner-scoped.");

      const failedSummaryRetry = await request("/financial-recovery-issues/" + summaryRecoveryIssue._id + "/retry-customer-sync", {
        method: "POST"
      });
      assert.equal(failedSummaryRetry.response.status, 503, JSON.stringify(failedSummaryRetry.payload));
      const stillOpenSummaryIssue = await FinancialRecoveryIssue.findOne({ _id: summaryRecoveryIssue._id, createdBy: ownerId }).lean();
      assert.equal(stillOpenSummaryIssue.status, "Open", "A failed retry must leave the recovery issue open.");
    } finally {
      Client.findOneAndUpdate = originalSummaryClientFindOneAndUpdate;
    }

    const successfulSummaryRetry = await request("/financial-recovery-issues/" + summaryRecoveryIssue._id + "/retry-customer-sync", {
      method: "POST"
    });
    assert.equal(successfulSummaryRetry.response.status, 200, JSON.stringify(successfulSummaryRetry.payload));
    assert.equal(successfulSummaryRetry.payload.issue.status, "Resolved");
    assert.ok(successfulSummaryRetry.payload.issue.resolutionNote.includes("successfully rebuilt"));

    const recoveredCustomer = await Client.findOne({ _id: summaryRecoveryClientId, createdBy: ownerId }).lean();
    assert.equal(round2(recoveredCustomer.totalPaid), 5);
    assert.equal(round2(recoveredCustomer.pendingPayments), 15);
    assert.equal(round2(recoveredCustomer.outstanding_balance), 15);
    assert.equal(recoveredCustomer.paymentHistory.length, 1);
    assert.ok(recoveredCustomer.payments.some(id => String(id) === String(summaryRecoveryInvoiceId)));

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

    // Pause a stale invoice edit immediately before save, post a payment, then
    // release the save. It must conflict rather than overwrite the due calculated
    // from the pre-payment snapshot.
    const staleEditInvoiceResponse = await request("/order/orders/create", {
      method: "POST",
      body: {
        clientId,
        orderDate: "2026-10-06T14:00:00.000Z",
        paymentTerms: "30",
        taxPercentage: 0,
        discountRate: 0,
        subOrders: [{
          orderName: "Invoice edit and payment race",
          qtyUnit: "PCS",
          quantity: 2,
          unitPrice: 100
        }]
      }
    });
    assert.equal(staleEditInvoiceResponse.response.status, 201, JSON.stringify(staleEditInvoiceResponse.payload));
    const staleEditInvoiceId = staleEditInvoiceResponse.payload.order._id;

    const originalOrderSave = Order.prototype.save;
    let invoiceEditSavePaused = false;
    let signalInvoiceEditSaveReached;
    const invoiceEditSaveReached = new Promise(resolve => {
      signalInvoiceEditSaveReached = resolve;
    });
    let releaseInvoiceEditSave;
    const invoiceEditSaveGate = new Promise(resolve => {
      releaseInvoiceEditSave = resolve;
    });
    const invoiceEditSaveFailsafe = setTimeout(() => {
      releaseInvoiceEditSave();
      signalInvoiceEditSaveReached();
    }, 3000);
    invoiceEditSaveFailsafe.unref?.();

    Order.prototype.save = function (...args) {
      if (
        !invoiceEditSavePaused
        && String(this._id || "") === String(staleEditInvoiceId)
        && !this.isNew
      ) {
        invoiceEditSavePaused = true;
        signalInvoiceEditSaveReached();
        return invoiceEditSaveGate.then(() => originalOrderSave.apply(this, args));
      }
      return originalOrderSave.apply(this, args);
    };

    let staleInvoiceEditResult;
    let paymentDuringInvoiceEdit;
    try {
      const staleInvoiceEditPromise = request(`/order/orders/${staleEditInvoiceId}/update`, {
        method: "PUT",
        body: {
          subOrders: [{
            orderName: "Invoice edit and payment race",
            qtyUnit: "PCS",
            quantity: 2,
            unitPrice: 80
          }]
        }
      });
      await invoiceEditSaveReached;
      paymentDuringInvoiceEdit = await request(`/order/orders/${staleEditInvoiceId}/pay`, {
        method: "POST",
        body: {
          amount: 100,
          method: "UPI",
          amountReference: `ITEDITPAY-${suffix}`,
          paymentDate: "2026-10-06T14:30:00.000Z"
        }
      });
      releaseInvoiceEditSave();
      staleInvoiceEditResult = await staleInvoiceEditPromise;
    } finally {
      clearTimeout(invoiceEditSaveFailsafe);
      releaseInvoiceEditSave();
      Order.prototype.save = originalOrderSave;
    }

    assert.equal(invoiceEditSavePaused, true, "The invoice edit must pause after reading the stale invoice and before saving.");
    assert.equal(paymentDuringInvoiceEdit.response.status, 200, JSON.stringify(paymentDuringInvoiceEdit.payload));
    assert.equal(round2(paymentDuringInvoiceEdit.payload.order.dueAmount), 100);
    assert.equal(staleInvoiceEditResult.response.status, 409, JSON.stringify(staleInvoiceEditResult.payload));

    const staleEditInvoiceAfterRace = await Order.findOne({
      _id: staleEditInvoiceId,
      createdBy: ownerId
    }).lean();
    assert.equal(round2(staleEditInvoiceAfterRace.roundOffFinalRevenue), 200, "The rejected edit must not persist its revised invoice total.");
    assert.equal(round2(staleEditInvoiceAfterRace.paidAmount), 100);
    assert.equal(round2(staleEditInvoiceAfterRace.dueAmount), 100, "The due must still equal invoice total minus posted payments.");
    assert.equal(staleEditInvoiceAfterRace.payments.length, 1);
    assert.equal(staleEditInvoiceAfterRace.paymentStatus, "Partial");
    
    // Race an invoice's non-financial edit against Credit Note posting. Even
    // when the edit does not alter invoice totals, its stale save must not erase
    // the newer invoice revision that records the posted Credit Note.
    const creditRaceClientResponse = await request("/clients", {
      method: "POST",
      body: {
        name: "Invoice Edit Race Customer " + suffix,
        companyName: "Invoice Edit Race Business " + suffix,
        phone: "9999999997"
      }
    });
    assert.equal(creditRaceClientResponse.response.status, 201, JSON.stringify(creditRaceClientResponse.payload));
    const creditRaceClientId = creditRaceClientResponse.payload._id;

    const staleCreditNoteInvoiceResponse = await request("/order/orders/create", {
      method: "POST",
      body: {
        clientId: creditRaceClientId,
        orderDate: "2026-10-06T15:00:00.000Z",
        paymentTerms: "30",
        taxPercentage: 0,
        discountRate: 0,
        subOrders: [{
          orderName: "Invoice edit and Credit Note race",
          qtyUnit: "PCS",
          quantity: 2,
          unitPrice: 100
        }]
      }
    });
    assert.equal(staleCreditNoteInvoiceResponse.response.status, 201, JSON.stringify(staleCreditNoteInvoiceResponse.payload));
    const staleCreditNoteInvoiceId = staleCreditNoteInvoiceResponse.payload.order._id;
    const staleCreditNoteNumber = "CE" + suffix;

    const originalCreditRaceSave = Order.prototype.save;
    let creditRaceEditPaused = false;
    let signalCreditRaceSaveReached;
    const creditRaceSaveReached = new Promise(resolve => { signalCreditRaceSaveReached = resolve; });
    let releaseCreditRaceSave;
    const creditRaceSaveGate = new Promise(resolve => { releaseCreditRaceSave = resolve; });
    const creditRaceFailsafe = setTimeout(() => {
      releaseCreditRaceSave();
      signalCreditRaceSaveReached();
    }, 3000);
    creditRaceFailsafe.unref?.();

    Order.prototype.save = function (...args) {
      if (!creditRaceEditPaused && String(this._id || "") === String(staleCreditNoteInvoiceId) && !this.isNew) {
        creditRaceEditPaused = true;
        signalCreditRaceSaveReached();
        return creditRaceSaveGate.then(() => originalCreditRaceSave.apply(this, args));
      }
      return originalCreditRaceSave.apply(this, args);
    };

    let staleCreditNoteEditResult;
    let creditNotePostedDuringStaleEdit;
    try {
      const staleCreditNoteEditPromise = request("/order/orders/" + staleCreditNoteInvoiceId + "/update", {
        method: "PUT",
        body: { note: "Stale edit must not replace the invoice version." }
      });
      await creditRaceSaveReached;
      creditNotePostedDuringStaleEdit = await request("/credit-notes", {
        method: "POST",
        body: {
          creditNoteNumber: staleCreditNoteNumber,
          creditNoteDate: "2026-10-06T15:30:00.000Z",
          reason: "Other",
          creditMode: "AMOUNT",
          originalOrderId: staleCreditNoteInvoiceId,
          manualCredit: { taxableAmount: 20, taxRate: 10 },
          settlement: {
            adjustmentType: "Outstanding",
            adjustmentAmount: 0,
            refundAmount: 0,
            customerCreditAmount: 22
          }
        }
      });
      releaseCreditRaceSave();
      staleCreditNoteEditResult = await staleCreditNoteEditPromise;
    } finally {
      clearTimeout(creditRaceFailsafe);
      releaseCreditRaceSave();
      Order.prototype.save = originalCreditRaceSave;
    }

    assert.equal(creditRaceEditPaused, true, "The invoice edit must pause before the competing Credit Note is posted.");
    assert.equal(creditNotePostedDuringStaleEdit.response.status, 201, JSON.stringify(creditNotePostedDuringStaleEdit.payload));
    assert.equal(staleCreditNoteEditResult.response.status, 409, JSON.stringify(staleCreditNoteEditResult.payload));

    const [invoiceAfterCreditNoteRace, clientAfterCreditNoteRace, noteAfterCreditNoteRace] = await Promise.all([
      Order.findOne({ _id: staleCreditNoteInvoiceId, createdBy: ownerId }).lean(),
      Client.findOne({ _id: creditRaceClientId, createdBy: ownerId }).lean(),
      CreditNote.findOne({ creditNoteNumber: staleCreditNoteNumber, createdBy: ownerId }).lean()
    ]);
    assert.equal(round2(invoiceAfterCreditNoteRace.roundOffFinalRevenue), 200);
    assert.equal(invoiceAfterCreditNoteRace.creditNoteCount, 1, "The posted Credit Note must remain attached to the invoice.");
    assert.equal(round2(invoiceAfterCreditNoteRace.creditAppliedAmount || 0), 0);
    assert.equal(round2(invoiceAfterCreditNoteRace.dueAmount), 200);
    assert.equal(invoiceAfterCreditNoteRace.note, "", "The rejected stale edit must not persist its note.");
    assert.equal(noteAfterCreditNoteRace.status, "Posted");
    assert.equal(round2(noteAfterCreditNoteRace.totals.grandTotal), 22);
    assert.equal(round2(clientAfterCreditNoteRace.creditBalance), 22, "The posted Credit Note must remain reflected in its isolated customer credit balance.");



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

    const clientBeforePayment = await Client.findOne({ _id: clientId, createdBy: ownerId }).lean();
    assert.ok(clientBeforePayment, "The integration customer must exist before recording a payment.");
    const totalPaidBeforePayment = round2(clientBeforePayment.totalPaid);
    const outstandingBeforePayment = round2(clientBeforePayment.outstanding_balance);
    const paymentHistoryCountBeforePayment = clientBeforePayment.paymentHistory.length;

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
    const clientAfterPayment = await Client.findOne({ _id: clientId, createdBy: ownerId }).lean();
    assert.equal(round2(clientAfterPayment.totalPaid), round2(totalPaidBeforePayment + 60), "Customer paid total must increase by the posted payment.");
    assert.equal(round2(clientAfterPayment.pendingPayments), round2(outstandingBeforePayment - 60), "Customer pending payments must decrease by the payment amount.");
    assert.equal(round2(clientAfterPayment.outstanding_balance), round2(outstandingBeforePayment - 60), "Customer outstanding balance must decrease by the payment amount.");
    assert.equal(clientAfterPayment.paymentHistory.length, paymentHistoryCountBeforePayment + 1, "Customer payment history must include the new payment.");
    assert.ok(clientAfterPayment.payments.some(id => String(id) === String(orderId)), "Customer invoice links must remain available.");

    const paymentReceipt = await request(`/order/${orderId}/payments/${paymentId}/invoice`);
    assert.equal(paymentReceipt.response.status, 200, String(paymentReceipt.payload).slice(0, 500));
    assert.ok(paymentReceipt.payload.includes("60.00"), "Receipt must show the recorded payment amount.");
    assert.ok(paymentReceipt.payload.includes("220.00"), "Receipt must show the invoice total.");
    assert.ok(paymentReceipt.payload.includes("160.00"), "Receipt must show the remaining balance after payment.");

    const hiddenPaymentReceipt = await request(
      `/order/${orderId}/payments/${paymentId}/invoice`,
      { token: otherOwnerToken }
    );
    assert.equal(hiddenPaymentReceipt.response.status, 404, "Payment receipts must be isolated by business owner.");

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
    const clientAfterPaymentEdit = await Client.findOne({ _id: clientId, createdBy: ownerId }).lean();
    assert.equal(round2(clientAfterPaymentEdit.totalPaid), round2(totalPaidBeforePayment + 70), "Editing a payment must refresh the customer paid total.");
    assert.equal(round2(clientAfterPaymentEdit.pendingPayments), round2(outstandingBeforePayment - 70));
    assert.equal(round2(clientAfterPaymentEdit.outstanding_balance), round2(outstandingBeforePayment - 70));
    assert.equal(clientAfterPaymentEdit.paymentHistory.length, paymentHistoryCountBeforePayment + 1);
    const editedPaymentReceipt = await request(`/order/${orderId}/payments/${paymentId}/invoice`);
    assert.equal(editedPaymentReceipt.response.status, 200);
    assert.ok(editedPaymentReceipt.payload.includes("70.00"), "Receipt must use the edited payment amount.");
    assert.ok(editedPaymentReceipt.payload.includes("150.00"), "Receipt must use the updated remaining invoice balance.");

    const deletedPayment = await request(`/order/orders/${orderId}/payments/${paymentId}`, {
      method: "DELETE"
    });
    assert.equal(deletedPayment.response.status, 200, JSON.stringify(deletedPayment.payload));
    assert.equal(round2(deletedPayment.payload.order.paidAmount), 0);
    assert.equal(round2(deletedPayment.payload.order.dueAmount), 220);
    assert.equal(deletedPayment.payload.order.paymentStatus, "Unpaid");
    assert.equal(deletedPayment.payload.order.payments.length, 0);
    const clientAfterPaymentDelete = await Client.findOne({ _id: clientId, createdBy: ownerId }).lean();
    assert.equal(round2(clientAfterPaymentDelete.totalPaid), totalPaidBeforePayment, "Deleting a payment must restore the customer's prior paid total.");
    assert.equal(round2(clientAfterPaymentDelete.pendingPayments), outstandingBeforePayment);
    assert.equal(round2(clientAfterPaymentDelete.outstanding_balance), outstandingBeforePayment);
    assert.equal(clientAfterPaymentDelete.paymentHistory.length, paymentHistoryCountBeforePayment, "Deleting a payment must restore the prior customer payment history.");
    const deletedPaymentReceipt = await request(`/order/${orderId}/payments/${paymentId}/invoice`);
    assert.equal(deletedPaymentReceipt.response.status, 404, "A deleted payment must not remain printable as a receipt.");

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
    const clientAfterReplacementPayment = await Client.findOne({ _id: clientId, createdBy: ownerId }).lean();
    assert.equal(round2(clientAfterReplacementPayment.totalPaid), round2(totalPaidBeforePayment + 60));
    assert.equal(round2(clientAfterReplacementPayment.pendingPayments), round2(outstandingBeforePayment - 60));
    assert.equal(round2(clientAfterReplacementPayment.outstanding_balance), round2(outstandingBeforePayment - 60));
    assert.equal(clientAfterReplacementPayment.paymentHistory.length, paymentHistoryCountBeforePayment + 1);

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

    const initialCustomerTransactions = await request("/clients/" + clientId + "/transactions");
    assert.equal(initialCustomerTransactions.response.status, 200, JSON.stringify(initialCustomerTransactions.payload));
    const initialCreditRow = initialCustomerTransactions.payload.find(transaction =>
      transaction.type === "Credit Note" && String(transaction.creditNoteId) === String(creditNoteId)
    );
    assert.ok(initialCreditRow, "The customer transaction feed must include its Credit Notes.");
    assert.equal(round2(initialCreditRow.customerCreditAmount), 55);
    assert.equal(round2(initialCreditRow.amount), 55);
    assert.equal(initialCreditRow.status, "Posted");
    assert.ok(Array.isArray(initialCreditRow.settlementHistory));
    assert.equal(initialCreditRow.settlementHistory.length, 1);

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
      body: { amount: 10, reason: "Customer relationship adjustment" }
    });
    assert.equal(manualAdjustment.response.status, 200, JSON.stringify(manualAdjustment.payload));
    assert.equal(round2(manualAdjustment.payload.creditBalance), 76);
    assert.equal(round2(manualAdjustment.payload.creditBalanceAdjustment), 10);
    assert.equal(manualAdjustment.payload.creditBalanceHistory.length, 1);
    assert.equal(round2(manualAdjustment.payload.creditBalanceHistory[0].amount), 10);
    assert.equal(round2(manualAdjustment.payload.creditBalanceHistory[0].balanceAfter), 76);
    assert.equal(manualAdjustment.payload.creditBalanceHistory[0].reason, "Customer relationship adjustment");

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

    const customerStatement = await request("/clients/" + clientId + "/statement?from=2026-10-01&to=2026-10-31");
    assert.equal(customerStatement.response.status, 200, JSON.stringify(customerStatement.payload));
    assert.equal(customerStatement.payload.statement.receivables.currentOutstanding, round2(storedClient.outstanding_balance));
    assert.equal(customerStatement.payload.statement.receivables.reconcilesWithCustomerSummary, true);
    assert.equal(customerStatement.payload.statement.customerCredit.currentBalance, 10);
    assert.equal(customerStatement.payload.statement.customerCredit.closingBalance, 10);
    const hiddenCustomerStatement = await request("/clients/" + clientId + "/statement", { token: otherOwnerToken });
    assert.equal(hiddenCustomerStatement.response.status, 404, "Customer statements must be isolated by business owner.");

    // A Credit Note posted after a payment must not rewrite the earlier receipt.
    // A later payment sees the credit; cancellation only affects payments after cancellation.
    const timelineClientResponse = await request("/clients", {
      method: "POST",
      body: {
        name: "Credit Timeline Customer " + suffix,
        companyName: "Credit Timeline Business " + suffix,
        phone: "9999999996"
      }
    });
    assert.equal(timelineClientResponse.response.status, 201, JSON.stringify(timelineClientResponse.payload));
    const timelineClientId = timelineClientResponse.payload._id;

    const timelineInvoiceResponse = await request("/order/orders/create", {
      method: "POST",
      body: {
        clientId: timelineClientId,
        orderDate: "2026-10-14T09:00:00.000Z",
        paymentTerms: "30",
        taxPercentage: 0,
        discountRate: 0,
        subOrders: [{
          orderName: "Credit timeline item",
          qtyUnit: "PCS",
          quantity: 1,
          unitPrice: 100
        }]
      }
    });
    assert.equal(timelineInvoiceResponse.response.status, 201, JSON.stringify(timelineInvoiceResponse.payload));
    const timelineInvoiceId = timelineInvoiceResponse.payload.order._id;

    const timelinePaymentOne = await request("/order/orders/" + timelineInvoiceId + "/pay", {
      method: "POST",
      body: {
        amount: 60,
        method: "UPI",
        amountReference: "ITTL1-" + suffix,
        paymentDate: "2026-10-15T09:00:00.000Z"
      }
    });
    assert.equal(timelinePaymentOne.response.status, 200, JSON.stringify(timelinePaymentOne.payload));
    const timelinePaymentOneId = timelinePaymentOne.payload.order.payments[0]._id;

    const timelineCreditNoteResponse = await request("/credit-notes", {
      method: "POST",
      body: {
        creditNoteNumber: "TL" + suffix,
        creditNoteDate: "2026-10-16T09:00:00.000Z",
        reason: "Post Sale Discount",
        creditMode: "AMOUNT",
        originalOrderId: timelineInvoiceId,
        manualCredit: { taxableAmount: 20, taxRate: 0 },
        settlement: {
          adjustmentType: "Outstanding",
          adjustmentAmount: 20,
          refundAmount: 0,
          customerCreditAmount: 0
        }
      }
    });
    assert.equal(timelineCreditNoteResponse.response.status, 201, JSON.stringify(timelineCreditNoteResponse.payload));
    const timelineCreditNoteId = timelineCreditNoteResponse.payload.creditNote._id;
    assert.equal(round2(timelineCreditNoteResponse.payload.creditNote.originalOrderId.dueAmount), 20);

    const timelineReceiptOne = await request(
      "/order/" + timelineInvoiceId + "/payments/" + timelinePaymentOneId + "/invoice"
    );
    assert.equal(timelineReceiptOne.response.status, 200);
    assert.ok(timelineReceiptOne.payload.includes("100.00"), "The earlier receipt must show the full due before the payment.");
    assert.ok(timelineReceiptOne.payload.includes("40.00"), "The later Credit Note must not reduce the earlier receipt balance.");
    assert.equal(timelineReceiptOne.payload.includes("estimates"), false, "New Credit Notes must have reliable settlement history.");

    const timelinePaymentTwo = await request("/order/orders/" + timelineInvoiceId + "/pay", {
      method: "POST",
      body: {
        amount: 10,
        method: "UPI",
        amountReference: "ITTL2-" + suffix,
        paymentDate: "2026-10-17T09:00:00.000Z"
      }
    });
    assert.equal(timelinePaymentTwo.response.status, 200, JSON.stringify(timelinePaymentTwo.payload));
    const timelinePaymentTwoId = timelinePaymentTwo.payload.order.payments[1]._id;

    const timelineReceiptTwo = await request(
      "/order/" + timelineInvoiceId + "/payments/" + timelinePaymentTwoId + "/invoice"
    );
    assert.equal(timelineReceiptTwo.response.status, 200);
    assert.ok(timelineReceiptTwo.payload.includes("20.00"), "The later receipt must include the earlier Credit Note adjustment.");
    assert.ok(timelineReceiptTwo.payload.includes("10.00"), "The later receipt must show the correct remaining due.");

    const editedTimelineCreditNote = await request("/credit-notes/" + timelineCreditNoteId, {
      method: "PUT",
      body: {
        creditNoteNumber: "TL" + suffix,
        creditNoteDate: "2026-10-16T09:00:00.000Z",
        reason: "Post Sale Discount",
        creditMode: "AMOUNT",
        manualCredit: { taxableAmount: 20, taxRate: 0 },
        settlement: {
          adjustmentType: "Outstanding",
          adjustmentAmount: 10,
          refundAmount: 10,
          refundMethod: "Cash",
          customerCreditAmount: 0
        }
      }
    });
    assert.equal(editedTimelineCreditNote.response.status, 200, JSON.stringify(editedTimelineCreditNote.payload));
    const editedTimelineHistory = editedTimelineCreditNote.payload.creditNote.settlementHistory;
    assert.equal(editedTimelineHistory.length, 2, "Editing a posted Credit Note must append a dated settlement snapshot.");
    assert.equal(editedTimelineHistory[0].eventType, "posted");
    assert.equal(editedTimelineHistory[1].eventType, "edited");

    const timelineReceiptTwoAfterEdit = await request(
      "/order/" + timelineInvoiceId + "/payments/" + timelinePaymentTwoId + "/invoice"
    );
    assert.equal(timelineReceiptTwoAfterEdit.response.status, 200);
    assert.ok(timelineReceiptTwoAfterEdit.payload.includes("20.00"), "Editing a Credit Note later must preserve its earlier applied amount on an existing receipt.");
    assert.ok(timelineReceiptTwoAfterEdit.payload.includes("10.00"));

    const timelineCreditNoteCancellation = await request("/credit-notes/" + timelineCreditNoteId + "/cancel", {
      method: "POST",
      body: { reason: "Timeline cancellation test" }
    });
    assert.equal(timelineCreditNoteCancellation.response.status, 200, JSON.stringify(timelineCreditNoteCancellation.payload));

    const timelineReceiptTwoAfterCancellation = await request(
      "/order/" + timelineInvoiceId + "/payments/" + timelinePaymentTwoId + "/invoice"
    );
    assert.equal(timelineReceiptTwoAfterCancellation.response.status, 200);
    assert.ok(timelineReceiptTwoAfterCancellation.payload.includes("20.00"), "A cancellation after payment must not rewrite that earlier receipt.");
    assert.ok(timelineReceiptTwoAfterCancellation.payload.includes("10.00"));

    const timelinePaymentThree = await request("/order/orders/" + timelineInvoiceId + "/pay", {
      method: "POST",
      body: {
        amount: 10,
        method: "UPI",
        amountReference: "ITTL3-" + suffix,
        paymentDate: new Date().toISOString()
      }
    });
    assert.equal(timelinePaymentThree.response.status, 200, JSON.stringify(timelinePaymentThree.payload));
    const timelinePaymentThreeId = timelinePaymentThree.payload.order.payments[2]._id;

    const timelineReceiptThree = await request(
      "/order/" + timelineInvoiceId + "/payments/" + timelinePaymentThreeId + "/invoice"
    );
    assert.equal(timelineReceiptThree.response.status, 200);
    assert.ok(timelineReceiptThree.payload.includes("30.00"), "A payment after cancellation must use the restored invoice due.");
    assert.ok(timelineReceiptThree.payload.includes("20.00"), "The post-cancellation receipt must show the remaining due.");

    const timelineTransactions = await request("/clients/" + timelineClientId + "/transactions");
    assert.equal(timelineTransactions.response.status, 200);
    const cancelledTimelineNote = timelineTransactions.payload.find(transaction =>
      transaction.type === "Credit Note" && String(transaction.creditNoteId) === String(timelineCreditNoteId)
    );
    assert.ok(cancelledTimelineNote, "The customer feed must retain the cancelled Credit Note.");
    assert.equal(cancelledTimelineNote.status, "Cancelled");
    assert.equal(round2(cancelledTimelineNote.adjustmentAmount), 10);
    assert.equal(round2(cancelledTimelineNote.refundAmount), 10);
    assert.ok(cancelledTimelineNote.cancelledAt, "The customer feed must show the cancellation date.");
    assert.equal(cancelledTimelineNote.settlementHistory.length, 3);
    assert.equal(cancelledTimelineNote.settlementHistory[1].eventType, "edited");
    assert.equal(cancelledTimelineNote.settlementHistory[2].eventType, "cancelled");

    const timelineStatement = await request("/clients/" + timelineClientId + "/statement?from=2026-10-14&to=2026-10-31");
    assert.equal(timelineStatement.response.status, 200, JSON.stringify(timelineStatement.payload));
    assert.equal(timelineStatement.payload.statement.receivables.openingBalance, 0);
    assert.equal(timelineStatement.payload.statement.receivables.totalDebits, 120);
    assert.equal(timelineStatement.payload.statement.receivables.totalCredits, 100);
    assert.equal(timelineStatement.payload.statement.receivables.closingBalance, 20);
    assert.equal(timelineStatement.payload.statement.receivables.currentOutstanding, 20);
    assert.equal(timelineStatement.payload.statement.receivables.reconcilesWithCustomerSummary, true);
    assert.equal(timelineStatement.payload.statement.customerCredit.currentBalance, 0);

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

    // A failed compensation must create a durable, owner-scoped recovery issue.
    const recoveryProduct = await Product.create({
      productName: "Recovery Product " + suffix,
      productCode: "ITREC-" + suffix,
      rate: 10,
      quantity: 10,
      createdBy: ownerId
    });
    const recoveryInvoiceResponse = await request("/order/orders/create", {
      method: "POST",
      body: {
        clientId,
        orderDate: "2026-10-08T16:00:00.000Z",
        paymentTerms: "30",
        taxPercentage: 0,
        discountRate: 0,
        subOrders: [{
          productId: String(recoveryProduct._id),
          orderName: "Recovery log item",
          qtyUnit: "PCS",
          quantity: 2,
          unitPrice: 10
        }]
      }
    });
    assert.equal(recoveryInvoiceResponse.response.status, 201, JSON.stringify(recoveryInvoiceResponse.payload));
    const recoveryInvoiceId = recoveryInvoiceResponse.payload.order._id;
    const recoverySubOrderId = recoveryInvoiceResponse.payload.order.subOrders[0]._id;

    const originalRecoveryProductUpdate = Product.findOneAndUpdate;
    let stockCompensationFailureInjected = false;
    Product.findOneAndUpdate = function (filter, update, options) {
      if (
        !stockCompensationFailureInjected
        && String(filter?._id || "") === String(recoveryProduct._id)
        && Number(update?.$inc?.quantity) < 0
      ) {
        stockCompensationFailureInjected = true;
        return Promise.reject(new Error("Injected stock compensation failure for recovery logging."));
      }
      return originalRecoveryProductUpdate.apply(this, arguments);
    };

    let failedRecoveryCreditNote;
    try {
      failedRecoveryCreditNote = await withStandaloneFallback(() => request("/credit-notes", {
        method: "POST",
        body: {
          creditNoteNumber,
          creditNoteDate: "2026-10-08T16:30:00.000Z",
          reason: "Sales Return",
          creditMode: "ITEM",
          originalOrderId: recoveryInvoiceId,
          stockAffecting: true,
          items: [{ sourceSubOrderId: recoverySubOrderId, quantity: 1 }],
          settlement: {
            adjustmentType: "Outstanding",
            adjustmentAmount: 0,
            refundAmount: 10,
            refundMethod: "Cash",
            customerCreditAmount: 0
          }
        }
      }));
    } finally {
      Product.findOneAndUpdate = originalRecoveryProductUpdate;
    }

    assert.equal(stockCompensationFailureInjected, true, "The stock rollback failure must be injected after the Credit Note write fails.");
    assert.equal(failedRecoveryCreditNote.response.status, 409, JSON.stringify(failedRecoveryCreditNote.payload));
    const recoveryProductAfterFailure = await Product.findOne({ _id: recoveryProduct._id, createdBy: ownerId }).lean();
    assert.equal(recoveryProductAfterFailure.quantity, 11, "The injected failed compensation should leave the known stock discrepancy for investigation.");

    const ownerRecoveryIssuesResponse = await request("/financial-recovery-issues?status=Open");
    assert.equal(ownerRecoveryIssuesResponse.response.status, 200, JSON.stringify(ownerRecoveryIssuesResponse.payload));
    const recoveryIssue = ownerRecoveryIssuesResponse.payload.issues.find(issue =>
      issue.operation === "credit-note-create"
      && (issue.invoiceIds || []).some(id => String(id) === String(recoveryInvoiceId))
    );
    assert.ok(recoveryIssue, "The failed compensation must persist an open recovery issue for the affected invoice.");
    assert.equal(recoveryIssue.status, "Open");
    assert.ok((recoveryIssue.productIds || []).some(id => String(id) === String(recoveryProduct._id)));
    assert.ok((recoveryIssue.recoveryFailures || []).some(failure =>
      failure.step === "restore-stock" && failure.message.includes("Injected stock compensation failure")
    ));

    const otherOwnerRecoveryIssues = await request("/financial-recovery-issues?status=All", { token: otherOwnerToken });
    assert.equal(otherOwnerRecoveryIssues.response.status, 200, JSON.stringify(otherOwnerRecoveryIssues.payload));
    assert.equal(
      otherOwnerRecoveryIssues.payload.issues.some(issue => String(issue._id) === String(recoveryIssue._id)),
      false,
      "Recovery issues must not leak across business owners."
    );

    const shortResolutionNote = await request("/financial-recovery-issues/" + recoveryIssue._id + "/resolve", {
      method: "PATCH",
      body: { resolutionNote: "fixed" }
    });
    assert.equal(shortResolutionNote.response.status, 400, "Resolution requires a meaningful reconciliation note.");

    const correctedRecoveryProduct = await Product.findOneAndUpdate(
      { _id: recoveryProduct._id, createdBy: ownerId },
      { $set: { quantity: 10 } },
      { new: true }
    );
    assert.equal(correctedRecoveryProduct.quantity, 10, "Correct the deliberately introduced stock discrepancy before resolving its alert.");

    const resolvedRecoveryIssue = await request("/financial-recovery-issues/" + recoveryIssue._id + "/resolve", {
      method: "PATCH",
      body: { resolutionNote: "Physical stock discrepancy was investigated and corrected." }
    });
    assert.equal(resolvedRecoveryIssue.response.status, 200, JSON.stringify(resolvedRecoveryIssue.payload));
    assert.equal(resolvedRecoveryIssue.payload.issue.status, "Resolved");
    assert.equal(resolvedRecoveryIssue.payload.issue.resolvedBy, String(ownerId));

    const openRecoveryIssuesAfterResolve = await request("/financial-recovery-issues?status=Open");
    assert.equal(openRecoveryIssuesAfterResolve.response.status, 200);
    assert.equal(
      openRecoveryIssuesAfterResolve.payload.issues.some(issue => String(issue._id) === String(recoveryIssue._id)),
      false,
      "A reconciled issue must no longer appear in the open queue."
    );

    // Bulk-payment recovery also needs a durable issue if one invoice cannot be
    // compensated after a later batch write fails.
    const bulkRecoveryReference = "ITBULKREC-" + suffix;
    const originalPaymentLogSaveForRecovery = PaymentLog.prototype.save;
    const originalOrderUpdateForRecovery = Order.findOneAndUpdate;
    let recoveryPaymentLogFailureInjected = false;
    let bulkCompensationFailureInjected = false;

    PaymentLog.prototype.save = function (...args) {
      if (this.reference === bulkRecoveryReference) {
        recoveryPaymentLogFailureInjected = true;
        return Promise.reject(new Error("Injected bulk PaymentLog persistence failure."));
      }
      return originalPaymentLogSaveForRecovery.apply(this, args);
    };

    Order.findOneAndUpdate = function (filter, update, options) {
      if (
        String(filter?._id || "") === String(fallbackInvoiceOneId)
        && filter?.["payments._id"]
        && update?.$pull?.payments
      ) {
        bulkCompensationFailureInjected = true;
        return Promise.resolve(null);
      }
      return originalOrderUpdateForRecovery.apply(this, arguments);
    };

    let failedBulkRecovery;
    try {
      failedBulkRecovery = await withStandaloneFallback(() => request("/order/orders/payments/bulk", {
        method: "PUT",
        body: {
          method: "UPI",
          amount: 20,
          amountReference: bulkRecoveryReference,
          splitType: "custom",
          paymentDate: "2026-10-08T17:00:00.000Z",
          updates: [
            { orderId: fallbackInvoiceOneId, amount: 10 },
            { orderId: fallbackInvoiceTwoId, amount: 10 }
          ]
        }
      }));
    } finally {
      PaymentLog.prototype.save = originalPaymentLogSaveForRecovery;
      Order.findOneAndUpdate = originalOrderUpdateForRecovery;
    }

    assert.equal(recoveryPaymentLogFailureInjected, true, "The bulk batch log must fail after invoice allocations.");
    assert.equal(bulkCompensationFailureInjected, true, "One invoice allocation's compensation must fail.");
    assert.equal(failedBulkRecovery.response.status, 500, JSON.stringify(failedBulkRecovery.payload));

    const [bulkRecoveryOrderOne, bulkRecoveryOrderTwo, missingBulkLog, reservedRecoveryReference] = await Promise.all([
      Order.findOne({ _id: fallbackInvoiceOneId, createdBy: ownerId }).lean(),
      Order.findOne({ _id: fallbackInvoiceTwoId, createdBy: ownerId }).lean(),
      PaymentLog.findOne({ userId: ownerId, reference: bulkRecoveryReference }).lean(),
      PaymentReference.findOne({ createdBy: ownerId, reference: bulkRecoveryReference }).lean()
    ]);
    assert.equal(round2(bulkRecoveryOrderOne.paidAmount), 60, "The unresolved allocation must remain visible for reconciliation.");
    assert.equal(round2(bulkRecoveryOrderOne.dueAmount), 40);
    assert.equal(bulkRecoveryOrderOne.payments.length, 2);
    assert.equal(round2(bulkRecoveryOrderTwo.paidAmount), 50, "The other invoice's successful compensation must be complete.");
    assert.equal(round2(bulkRecoveryOrderTwo.dueAmount), 50);
    assert.equal(bulkRecoveryOrderTwo.payments.length, 1);
    assert.equal(missingBulkLog, null, "The failed batch log must not be persisted.");
    assert.ok(reservedRecoveryReference, "Keep the reference reserved when rollback is incomplete to prevent unsafe reuse.");

    const bulkRecoveryIssuesResponse = await request("/financial-recovery-issues?status=Open");
    assert.equal(bulkRecoveryIssuesResponse.response.status, 200);
    const bulkRecoveryIssue = bulkRecoveryIssuesResponse.payload.issues.find(issue =>
      issue.operation === "bulk-payment"
      && (issue.invoiceIds || []).some(id => String(id) === String(fallbackInvoiceOneId))
    );
    assert.ok(bulkRecoveryIssue, "An incomplete bulk rollback must produce an open recovery issue.");
    assert.ok((bulkRecoveryIssue.recoveryFailures || []).some(failure =>
      failure.step === "remove-invoice-payment"
      && String(failure.entityId) === String(fallbackInvoiceOneId)
    ));


  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.readyState === 1 && ownerId) {
      await Promise.all([
        CreditNote.deleteMany({ createdBy: ownerId }),
        Order.deleteMany({ createdBy: ownerId }),
        Client.deleteMany({ createdBy: ownerId }),
        Product.deleteMany({ createdBy: ownerId }),
        Profile.deleteMany({ createdBy: String(ownerId) }),
        FinancialRecoveryIssue.deleteMany({ createdBy: ownerId }),
        PaymentReference.deleteMany({ createdBy: ownerId }),
        PaymentLog.deleteMany({ userId: ownerId })
      ]);
    }
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
});
