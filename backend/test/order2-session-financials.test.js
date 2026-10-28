const test = require("node:test");
const assert = require("node:assert/strict");
const Order = require("../models/Order2");

function getFinancialUpdateHook() {
  const registry = Order.schema.s.hooks._pres;
  const registered = registry.findOneAndUpdate ||
    (typeof registry.get === "function" ? registry.get("findOneAndUpdate") : []);
  const hooks = Array.isArray(registered) ? registered : [registered];
  const match = hooks.find(item =>
    String(item?.fn || item).includes("const currentQuery=this.model.findOne(this.getQuery())")
  );
  if (!match) throw new Error("Could not locate invoice financial update middleware.");
  return match.fn || match;
}

test("invoice financial recalculation reads through the active transaction session", async () => {
  const hook = getFinancialUpdateHook();
  const originalFindOne = Order.findOne;
  const session = { transactionMarker: true };
  let readSession = null;
  let readFilter = null;

  Order.findOne = filter => {
    readFilter = filter;
    return {
      session(value) {
        readSession = value;
        return this;
      },
      lean() {
        return Promise.resolve({
          _id: "invoice-1",
          subOrders: [],
          payments: [],
          taxPercentage: 5,
          discountRate: 0,
          creditAppliedAmount: 0
        });
      }
    };
  };

  const context = {
    model: Order,
    getQuery: () => ({ _id: "invoice-1", createdBy: "business-1" }),
    getOptions: () => ({ session }),
    getUpdate: () => ({ $push: { payments: { amount: 25, method: "Cash" } } }),
    setUpdate(update) {
      this.updated = update;
    }
  };

  try {
    let hookError = null;
    await hook.call(context, error => { hookError = error || null; });
    assert.equal(hookError, null);
    assert.equal(readSession, session);
    assert.deepEqual(readFilter, { _id: "invoice-1", createdBy: "business-1" });
    assert.equal(context.updated.$set.paidAmount, 25);
    assert.equal(context.updated.$set.dueAmount, 0);
  } finally {
    Order.findOne = originalFindOne;
  }
});
