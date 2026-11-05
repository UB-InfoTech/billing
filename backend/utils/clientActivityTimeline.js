const sameId=(left,right)=>String(left??"")===String(right??"");
const validDate=value=>{const date=value?new Date(value):null;return date&&!Number.isNaN(date.getTime())?date:null;};
const round2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;

function buildClientActivityTimeline({client,manualActivities=[],orders=[],creditNotes=[],expenses=[],calendarEvents=[],limit=150,sourceTruncated=false}){
 const entries=[];
 const clientId=client?._id;
 const add=entry=>{
  const date=validDate(entry.occurredAt);
  if(!date)return;
  entries.push({
   id:String(entry.id||entry.sourceId||entries.length),
   source:entry.source||"system",
   sourceId:entry.sourceId?String(entry.sourceId):"",
   type:entry.type||"other",
   category:entry.category||"account",
   title:String(entry.title||"Activity"),
   description:String(entry.description||""),
   occurredAt:date,
   reference:String(entry.reference||""),
   amount:entry.amount===null||entry.amount===undefined||entry.amount===""?null:Number(entry.amount),
   status:entry.status||"",
   dueAt:validDate(entry.dueAt),
   canUpdateStatus:Boolean(entry.canUpdateStatus)
  });
 };
 if(client?.createdAt)add({
  id:"client-created-"+String(clientId),source:"client",sourceId:clientId,
  type:"client_created",category:"account",title:"Customer added",
  description:"This customer was added to your records.",occurredAt:client.createdAt
 });
 for(const activity of manualActivities)add({
  id:"manual-"+String(activity._id),source:"manual",sourceId:activity._id,type:activity.type,
  category:activity.type==="profile_update"?"account":["task","follow_up"].includes(activity.type)?"follow_up":"interaction",
  title:activity.subject,description:activity.description,
  occurredAt:activity.occurredAt||activity.createdAt,dueAt:activity.dueAt,
  status:activity.status,canUpdateStatus:["task","follow_up"].includes(activity.type)
 });

 for(const order of orders){
  const number=String(order.orderNumber||"Invoice");
  const history=Array.isArray(order.financialHistory)?order.financialHistory:[];
  if(history.length){
   history.forEach((item,index)=>{
    const before=item.previous?.clientId,after=item.next?.clientId;
    if(!sameId(before,clientId)&&!sameId(after,clientId))return;
    const created=item.eventType==="created";
    const reassigned=!sameId(before,after);
    const title=created?"Invoice created":reassigned&&sameId(after,clientId)?"Invoice linked to this customer":reassigned?"Invoice moved to another customer":"Invoice updated";
    add({
     id:"invoice-history-"+String(order._id)+"-"+index,source:"invoice",sourceId:order._id,
     type:created?"invoice_created":"invoice_updated",category:"billing",title,
     description:number+(item.next?.invoiceTotal!==undefined?" · Total ₹"+round2(item.next.invoiceTotal).toLocaleString("en-IN"):""),
     occurredAt:item.effectiveAt||item.recordedAt||order.createdAt||order.orderDate,
     reference:number,amount:item.next?.invoiceTotal
    });
   });
  }else if(sameId(order.clientId,clientId))add({
   id:"invoice-created-"+String(order._id),source:"invoice",sourceId:order._id,
   type:"invoice_created",category:"billing",title:"Invoice created",
   description:number+" · Total ₹"+round2(order.roundOffFinalRevenue??order.totalAmount).toLocaleString("en-IN"),
   occurredAt:order.createdAt||order.orderDate,reference:number,
   amount:order.roundOffFinalRevenue??order.totalAmount
  });
  if(sameId(order.clientId,clientId))(Array.isArray(order.statusHistory)?order.statusHistory:[]).forEach((item,index)=>add({
   id:"invoice-status-"+String(order._id)+"-"+index,source:"invoice",sourceId:order._id,
   type:"invoice_status",category:"billing",title:"Invoice status changed",
   description:number+" · "+String(item.status||"Status updated"),
   occurredAt:item.timestamp||order.updatedAt||order.createdAt,reference:number,status:item.status
  }));
  const paymentHistory=Array.isArray(order.paymentHistory)?order.paymentHistory:[];
  if(paymentHistory.length){
   paymentHistory.forEach((item,index)=>{
    const snapshot=item.after||item.before||{};
    const verb=item.action==="added"?"received":item.action==="edited"?"updated":"removed";
    add({
     id:"payment-history-"+String(order._id)+"-"+index,source:"payment",sourceId:order._id,
     type:"payment_"+String(item.action||"updated"),category:"billing",title:"Payment "+verb,
     description:number+" · "+String(snapshot.method||"Payment")+(snapshot.amountReference?" · "+snapshot.amountReference:""),
     occurredAt:item.effectiveAt||item.recordedAt||snapshot.paymentDate,
     reference:number,amount:snapshot.amount,status:item.action
    });
   });
  }else if(sameId(order.clientId,clientId))(Array.isArray(order.payments)?order.payments:[]).forEach((payment,index)=>add({
   id:"payment-"+String(order._id)+"-"+String(payment._id||index),source:"payment",sourceId:order._id,
   type:"payment_received",category:"billing",title:"Payment received",
   description:number+" · "+String(payment.method||"Payment")+(payment.amountReference?" · "+payment.amountReference:""),
   occurredAt:payment.paymentDate||payment.createdAt,reference:number,amount:payment.amount
  }));
 }

 for(const creditNote of creditNotes){
  const reference=String(creditNote.creditNoteNumber||"Credit Note");
  const history=Array.isArray(creditNote.settlementHistory)?creditNote.settlementHistory:[];
  if(history.length){
   history.forEach((item,index)=>{
    const title=item.eventType==="posted"?"Credit Note posted":item.eventType==="cancelled"?"Credit Note cancelled":item.eventType==="edited"?"Credit Note updated":"Credit Note activity";
    add({
     id:"credit-note-history-"+String(creditNote._id)+"-"+index,source:"credit_note",sourceId:creditNote._id,
     type:"credit_note_"+String(item.eventType||"updated"),category:"billing",title,
     description:reference+" · "+(item.status||creditNote.status||""),
     occurredAt:item.effectiveAt||item.recordedAt||creditNote.creditNoteDate||creditNote.createdAt,
     reference,amount:creditNote.totals?.grandTotal,status:item.status||creditNote.status
    });
   });
  }else add({
   id:"credit-note-"+String(creditNote._id),source:"credit_note",sourceId:creditNote._id,
   type:"credit_note_created",category:"billing",
   title:creditNote.status==="Cancelled"?"Credit Note cancelled":"Credit Note created",
   description:reference+" · "+String(creditNote.reason||""),
   occurredAt:creditNote.creditNoteDate||creditNote.createdAt,reference,
   amount:creditNote.totals?.grandTotal,status:creditNote.status
  });
 }
 for(const expense of expenses)add({
  id:"expense-"+String(expense._id),source:"expense",sourceId:expense._id,
  type:"expense_linked",category:"finance",title:"Expense linked to customer",
  description:[expense.title||expense.category,expense.description].filter(Boolean).join(" · "),
  occurredAt:expense.date||expense.createdAt,reference:expense.orderId?"Linked invoice":"Expense",amount:expense.amount
 });
 for(const event of calendarEvents)add({
  id:"calendar-event-"+String(event._id),source:"calendar",sourceId:event._id,
  type:"calendar_event",category:"interaction",title:event.title||"Calendar event",
  description:"Scheduled customer event"+(event.end?" · Until "+new Date(event.end).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}):""),
  occurredAt:event.start||event.createdAt,reference:"Calendar event"
 });
 (Array.isArray(client?.creditBalanceHistory)?client.creditBalanceHistory:[]).forEach((item,index)=>{
  const amount=round2(item.amount);
  add({
   id:"client-credit-"+String(clientId)+"-"+index,source:"client_credit",sourceId:clientId,
   type:"credit_adjustment",category:"finance",
   title:amount>=0?"Customer credit added":"Customer credit reduced",
   description:item.reason||"Manual credit balance adjustment",occurredAt:item.effectiveAt,
   amount:Math.abs(amount),status:"Balance after: ₹"+round2(item.balanceAfter).toLocaleString("en-IN")
  });
 });
 entries.sort((a,b)=>new Date(b.occurredAt)-new Date(a.occurredAt));
 const safeLimit=Math.min(500,Math.max(1,Number(limit)||150));
 return {activities:entries.slice(0,safeLimit),total:entries.length,hasMore:sourceTruncated||entries.length>safeLimit};
}
module.exports={buildClientActivityTimeline};
