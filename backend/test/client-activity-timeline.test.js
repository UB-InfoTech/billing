const test=require("node:test");
const assert=require("node:assert/strict");
const {buildClientActivityTimeline}=require("../utils/clientActivityTimeline");

const client={_id:"client-1",createdAt:"2026-01-01T09:00:00.000Z",creditBalanceHistory:[
 {amount:100,balanceAfter:100,effectiveAt:"2026-01-03T09:00:00.000Z",reason:"Opening credit"}
]};

test("combines interactions, invoices, payments, credit notes and expenses in newest-first order",()=>{
 const result=buildClientActivityTimeline({
  client,
  manualActivities:[{_id:"activity-1",type:"call",subject:"Discussed new designs",description:"Follow up next week",occurredAt:"2026-01-06T09:00:00.000Z",status:"completed"}],
  orders:[{
   _id:"order-1",clientId:"client-1",orderNumber:"INV-001",createdAt:"2026-01-02T09:00:00.000Z",
   financialHistory:[{eventType:"created",effectiveAt:"2026-01-02T09:00:00.000Z",next:{clientId:"client-1",invoiceTotal:1000}}],
   statusHistory:[{status:"Pending",timestamp:"2026-01-02T09:00:00.000Z"}],
   paymentHistory:[{action:"added",effectiveAt:"2026-01-04T09:00:00.000Z",after:{amount:500,method:"UPI",amountReference:"TXN-1"}}]
  }],
  creditNotes:[{_id:"credit-1",creditNoteNumber:"CN-001",reason:"Sales Return",status:"Posted",creditNoteDate:"2026-01-05T09:00:00.000Z",totals:{grandTotal:100},settlementHistory:[{eventType:"posted",effectiveAt:"2026-01-05T09:00:00.000Z",status:"Posted"}]}],
  expenses:[{_id:"expense-1",title:"Delivery charge",amount:50,date:"2026-01-07T09:00:00.000Z",description:"Local delivery"}],
  limit:50
 });
 const types=result.activities.map(item=>item.type);
 for(const type of ["client_created","invoice_created","invoice_status","payment_added","credit_note_posted","credit_adjustment","call","expense_linked"])assert.ok(types.includes(type),type);
 assert.equal(result.activities[0].type,"expense_linked");
 assert.equal(result.hasMore,false);
});

test("keeps task completion and due dates in the activity timeline",()=>{
 const result=buildClientActivityTimeline({client,manualActivities:[
  {_id:"task-1",type:"task",subject:"Send quotation",occurredAt:"2026-02-01T09:00:00.000Z",dueAt:"2026-02-02T09:00:00.000Z",status:"open"}
 ]});
 const task=result.activities.find(item=>item.sourceId==="task-1");
 assert.equal(task.status,"open");
 assert.equal(task.canUpdateStatus,true);
 assert.equal(new Date(task.dueAt).toISOString(),"2026-02-02T09:00:00.000Z");
});

test("respects activity feed limits and reports more history",()=>{
 const result=buildClientActivityTimeline({
  client:{_id:"c1",createdAt:"2026-01-01"},
  manualActivities:Array.from({length:5},(_,index)=>({_id:String(index),type:"note",subject:"Note "+index,occurredAt:new Date(Date.UTC(2026,0,index+2))})),
  limit:2
 });
 assert.equal(result.activities.length,2);
 assert.equal(result.hasMore,true);
 assert.equal(result.total,6);
});
