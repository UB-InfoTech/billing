const test=require("node:test");
const assert=require("node:assert/strict");
const mongoose=require("mongoose");
const plainMap=value=>value instanceof Map?Object.fromEntries(value.entries()):value&&typeof value==="object"?{...value}:{};
const jwt=require("jsonwebtoken");

process.env.JWT_SECRET||="billing-integration-tests-only-secret";
const app=require("../server");
const Client=require("../models/Client");
const Order=require("../models/Order2");
const PaymentLog=require("../models/PaymentLog2");
const Product=require("../models/Product");
const Expense=require("../models/Expense");
const CalendarEvent=require("../models/Calendar");
const Profile=require("../models/Profile");
const {prepareEwaybillForm}=require("../utils/ewaybillFormValidation");
const {prepareCreditNoteCustomFields}=require("../utils/creditNoteFormValidation");
const TableConfiguration=require("../models/TableConfiguration");
const TableCustomValue=require("../models/TableCustomValue");
const FormConfiguration=require("../models/FormConfiguration");

const mongoUri=process.env.MONGO_URI;

test("custom table values persist with correct types and enforce business ownership",{
  skip:!mongoUri?"Set MONGO_URI to run no-code table integration tests.":false
},async()=>{
  let server;
  let ownerId;
  let otherOwnerId;
  let ownerClientId;
  let otherClientId;
  let baseUrl;

  try{
    await mongoose.connect(mongoUri,{serverSelectionTimeoutMS:10000});
    await Promise.all([Client.init(),Order.init(),PaymentLog.init(),Product.init(),Expense.init(),CalendarEvent.init(),Profile.init(),TableConfiguration.init(),TableCustomValue.init(),FormConfiguration.init()]);

    ownerId=new mongoose.Types.ObjectId();
    otherOwnerId=new mongoose.Types.ObjectId();
    const ownerToken=jwt.sign({user:{id:String(ownerId)}},process.env.JWT_SECRET);
    const otherOwnerToken=jwt.sign({user:{id:String(otherOwnerId)}},process.env.JWT_SECRET);

    const ownerClient=await Client.create({
      createdBy:ownerId,
      name:"No-code integration customer",
      companyName:"Owner business",
      phone:"9999999999"
    });
    ownerClientId=ownerClient._id;

    const otherClient=await Client.create({
      createdBy:otherOwnerId,
      name:"Other business customer",
      companyName:"Other business"
    });
    otherClientId=otherClient._id;

    server=app.listen(0,"127.0.0.1");
    await new Promise((resolve,reject)=>{
      server.once("listening",resolve);
      server.once("error",reject);
    });
    baseUrl=`http://127.0.0.1:${server.address().port}/api`;

    await FormConfiguration.create({
      createdBy:ownerId,
      formKey:"clients.form",
      fields:[
        {key:"quantity",label:"Quantity",custom:true,fieldType:"number"},
        {key:"rate",label:"Rate",custom:true,fieldType:"currency"},
        {key:"amount",label:"Calculated amount",custom:true,fieldType:"currency",formula:"quantity * rate",editable:false},
        {
          key:"customerType",label:"Customer type",custom:true,fieldType:"select",
          options:[{value:"Individual",label:"Individual"},{value:"Business",label:"Business"}]
        },
        {
          key:"gstBusiness",label:"GST number",custom:true,fieldType:"text",
          conditions:[
            {action:"show",fieldKey:"customerType",operator:"equals",value:"Business"},
            {action:"require",fieldKey:"customerType",operator:"equals",value:"Business"}
          ]
        },
        {
          key:"referralClient",label:"Referred by customer",custom:true,fieldType:"reference",
          dataSource:{
            type:"lookup",resource:"clients",valueField:"_id",labelField:"companyName",searchField:"companyName",
            autoFill:[{targetKey:"referralPhone",sourceKey:"phone"}]
          }
        },
        {key:"referralPhone",label:"Referral phone",custom:true,fieldType:"phone",editable:false},
        {key:"protectedField",label:"Protected note",custom:true,fieldType:"text",editable:false,defaultValue:"Server-controlled"},
        {key:"hiddenField",label:"Hidden note",custom:true,fieldType:"text",visible:false,defaultValue:"Hidden default"}
      ]
    });

    await FormConfiguration.create([
      {
        createdBy:ownerId,
        formKey:"orders.form",
        fields:[
          {key:"packingCount",label:"Packing count",custom:true,fieldType:"number"},
          {key:"packingRate",label:"Packing rate",custom:true,fieldType:"currency"},
          {key:"packingCharge",label:"Packing charge",custom:true,fieldType:"currency",formula:"packingCount * packingRate",editable:false}
        ]
      },
      {
        createdBy:ownerId,
        formKey:"orders.items",
        fields:[
          {key:"extraUnits",label:"Extra units",custom:true,fieldType:"number"},
          {key:"extraRate",label:"Extra rate",custom:true,fieldType:"currency"},
          {key:"extraTotal",label:"Extra total",custom:true,fieldType:"currency",formula:"extraUnits * extraRate",editable:false}
        ]
      },
      {
        createdBy:ownerId,
        formKey:"creditnotes.form",
        fields:[
          {key:"returnCondition",label:"Returned item condition",custom:true,fieldType:"select",options:["Good","Damaged","Unused"]},
          {key:"inspectedUnits",label:"Inspected units",custom:true,fieldType:"number"},
          {key:"unitCost",label:"Unit cost",custom:true,fieldType:"currency"},
          {key:"estimatedLoss",label:"Estimated loss",custom:true,fieldType:"currency",formula:"inspectedUnits * unitCost",editable:false},
          {
            key:"reviewedBy",
            label:"Reviewed by",
            custom:true,
            fieldType:"reference",
            dataSource:{
              type:"lookup",resource:"clients",valueField:"_id",labelField:"companyName",searchField:"companyName",
              autoFill:[{targetKey:"reviewerPhone",sourceKey:"phone"}]
            }
          },
          {key:"reviewerPhone",label:"Reviewer phone",custom:true,fieldType:"phone",editable:false},
          {key:"internalNote",label:"Internal note",custom:true,fieldType:"text",visible:false,defaultValue:"Credit note internal default"}
        ]
      },
      {
        createdBy:ownerId,
        formKey:"orders.payments",
        fields:[
          {key:"amount",label:"Amount received",fieldType:"currency",required:true,locked:true,system:true,validation:{min:0.01}},
          {key:"method",label:"Payment method",fieldType:"select",required:true,locked:true,system:true,options:["Cash","Bank Transfer","UPI","Cheque","Bank"]},
          {key:"amountReference",label:"Reference",fieldType:"text",locked:true,system:true},
          {key:"paymentDate",label:"Date received",fieldType:"date",required:true,locked:true,system:true},
          {key:"collectionShift",label:"Collection shift",custom:true,fieldType:"select",options:["Morning","Evening"]},
          {key:"collectionEstimate",label:"Collection estimate",custom:true,fieldType:"currency",formula:"amount * 0.01",editable:false},
          {
            key:"collector",
            label:"Collector",
            custom:true,
            fieldType:"reference",
            dataSource:{
              type:"lookup",resource:"clients",valueField:"_id",labelField:"companyName",searchField:"companyName",
              autoFill:[{targetKey:"collectorPhone",sourceKey:"phone"}]
            }
          },
          {key:"collectorPhone",label:"Collector phone",custom:true,fieldType:"phone",editable:false},
          {key:"internalNote",label:"Internal payment note",custom:true,fieldType:"text",visible:false,defaultValue:"Internal note controlled by the business"}
        ]
      }
    ]);

    const creditNoteCustomFields=await prepareCreditNoteCustomFields({
      ownerId,
      value:{
        returnCondition:"Damaged",
        inspectedUnits:3,
        unitCost:12,
        estimatedLoss:999,
        reviewedBy:String(ownerClientId),
        reviewerPhone:"1111111111",
        internalNote:"Browser-submitted internal note"
      },
      isNewRecord:true
    });
    assert.equal(creditNoteCustomFields.returnCondition,"Damaged");
    assert.equal(creditNoteCustomFields.estimatedLoss,36);
    assert.equal(creditNoteCustomFields.reviewedBy,String(ownerClientId));
    assert.equal(creditNoteCustomFields.reviewerPhone,"9999999999");
    assert.equal(creditNoteCustomFields.internalNote,"Credit note internal default");

    const updatedCreditNoteCustomFields=await prepareCreditNoteCustomFields({
      ownerId,
      value:{inspectedUnits:4,unitCost:10,estimatedLoss:999,reviewerPhone:"2222222222"},
      existingCustomFields:creditNoteCustomFields,
      isNewRecord:false
    });
    assert.equal(updatedCreditNoteCustomFields.returnCondition,"Damaged");
    assert.equal(updatedCreditNoteCustomFields.estimatedLoss,40);
    assert.equal(updatedCreditNoteCustomFields.reviewerPhone,"9999999999");
    assert.equal(updatedCreditNoteCustomFields.internalNote,"Credit note internal default");

    await assert.rejects(
      ()=>prepareCreditNoteCustomFields({
        ownerId,
        value:{returnCondition:"Not an available condition"},
        isNewRecord:true
      }),
      /available option/i
    );
    await assert.rejects(
      ()=>prepareCreditNoteCustomFields({
        ownerId,
        value:{reviewedBy:String(otherClientId)},
        isNewRecord:true
      }),
      /not found in this business/i
    );

    async function request(path,{method="GET",body,token=ownerToken}={}){
      const response=await fetch(`${baseUrl}${path}`,{
        method,
        headers:{
          "x-auth-token":token,
          ...(body===undefined?{}:{"content-type":"application/json"})
        },
        ...(body===undefined?{}:{body:JSON.stringify(body)})
      });
      const raw=await response.text();
      let data;
      try{data=raw?JSON.parse(raw):null;}catch{data=raw;}
      return {status:response.status,data};
    }

    const formulaClient=await request("/clients",{
      method:"POST",
      body:{
        name:"Calculated customer",
        companyName:"Calculation Test Business",
        customFields:{
          quantity:4,
          rate:25,
          amount:999,
          customerType:"Individual",
          referralClient:String(ownerClientId),
          referralPhone:"1111111111",
          protectedField:"browser forgery",
          hiddenField:"browser forgery"
        }
      }
    });
    assert.equal(formulaClient.status,201,JSON.stringify(formulaClient.data));
    assert.equal(formulaClient.data.customFields.amount,100);
    assert.equal(formulaClient.data.customFields.referralClient,String(ownerClientId));
    assert.equal(formulaClient.data.customFields.referralPhone,"9999999999","The server must replace browser-submitted auto-fill values with the selected customer's saved phone.");
    assert.equal(formulaClient.data.customFields.protectedField,"Server-controlled","A non-editable custom field must use its saved default, not browser input.");
    assert.equal(formulaClient.data.customFields.hiddenField,"Hidden default","A hidden custom field must not accept a value submitted by the browser.");

    const missingBusinessGst=await request("/clients",{
      method:"POST",
      body:{
        name:"Business without GST",
        companyName:"Conditional GST Test",
        customFields:{customerType:"Business",gstBusiness:""}
      }
    });
    assert.equal(missingBusinessGst.status,400);
    assert.match(missingBusinessGst.data.message,/GST number/i);

    const invalidCustomerType=await request("/clients",{
      method:"POST",
      body:{
        name:"Invalid customer type",
        companyName:"Invalid Type Test",
        customFields:{customerType:"Not an available option"}
      }
    });
    assert.equal(invalidCustomerType.status,400);
    assert.match(invalidCustomerType.data.message,/available option/i);

    const crossBusinessFormReference=await request("/clients",{
      method:"POST",
      body:{
        name:"Cross-business referral",
        companyName:"Cross Business Test",
        customFields:{customerType:"Individual",referralClient:String(otherClientId)}
      }
    });
    assert.equal(crossBusinessFormReference.status,400);
    assert.match(crossBusinessFormReference.data.message,/not found in this business/i);

    const updatedFormulaClient=await request(`/clients/${formulaClient.data._id}`,{
      method:"PATCH",
      body:{customFields:{
        quantity:3,
        rate:20,
        amount:999,
        protectedField:"updated forgery",
        hiddenField:"updated forgery"
      }}
    });
    assert.equal(updatedFormulaClient.status,200,JSON.stringify(updatedFormulaClient.data));
    assert.equal(updatedFormulaClient.data.customFields.amount,60);
    assert.equal(updatedFormulaClient.data.customFields.protectedField,"Server-controlled");
    assert.equal(updatedFormulaClient.data.customFields.hiddenField,"Hidden default");

    const crossBusinessUpdate=await request(`/clients/${formulaClient.data._id}`,{
      method:"PATCH",
      body:{customFields:{referralClient:String(otherClientId),referralPhone:"forged"}}
    });
    assert.equal(crossBusinessUpdate.status,400);
    assert.match(crossBusinessUpdate.data.message,/not found in this business/i);
    const formulaClientAfterRejectedUpdate=await request(`/clients/${formulaClient.data._id}`);
    assert.equal(formulaClientAfterRejectedUpdate.status,200);
    assert.equal(formulaClientAfterRejectedUpdate.data.customFields.referralClient,String(ownerClientId));
    assert.equal(formulaClientAfterRejectedUpdate.data.customFields.referralPhone,"9999999999");

    const createdOrder=await request("/order/orders/create",{
      method:"POST",
      body:{
        clientId:String(ownerClientId),
        orderDate:"2026-10-31",
        customFields:{packingCount:2,packingRate:5,packingCharge:999},
        subOrders:[{
          orderName:"No-code integration item",
          quantity:2,
          cut:0,
          MTR:0,
          unitPrice:10,
          qtyUnit:"PCS",
          customFields:{extraUnits:3,extraRate:7,extraTotal:999}
        }]
      }
    });
    assert.equal(createdOrder.status,201,JSON.stringify(createdOrder.data));
    assert.equal(createdOrder.data.order.customFields.packingCharge,10);
    assert.equal(createdOrder.data.order.subOrders[0].customFields.extraTotal,21);

    const updatedOrder=await request(`/order/orders/${createdOrder.data.order._id}/update`,{
      method:"PUT",
      body:{
        customFields:{packingCount:4,packingRate:5,packingCharge:999}
      }
    });
    assert.equal(updatedOrder.status,200,JSON.stringify(updatedOrder.data));
    assert.equal(updatedOrder.data.order.customFields.packingCharge,20);
    assert.equal(updatedOrder.data.order.subOrders[0].customFields.extraTotal,21,"Unchanged invoice items retain their saved custom calculations.");

    const createdPayment=await request(`/order/orders/${createdOrder.data.order._id}/pay`,{
      method:"POST",
      body:{
        amount:5,
        method:"UPI",
        amountReference:"META-RECEIPT-1",
        paymentDate:"2026-10-31",
        customFields:{
          collectionShift:"Morning",
          collectionEstimate:999,
          collector:String(ownerClientId),
          collectorPhone:"1111111111",
          internalNote:"Browser forgery"
        }
      }
    });
    assert.equal(createdPayment.status,200,JSON.stringify(createdPayment.data));
    const createdPaymentRecord=createdPayment.data.order.payments.at(-1);
    assert.equal(createdPaymentRecord.amount,5);
    assert.equal(createdPaymentRecord.customFields.collectionShift,"Morning");
    assert.equal(createdPaymentRecord.customFields.collectionEstimate,0.05);
    assert.equal(createdPaymentRecord.customFields.collector,String(ownerClientId));
    assert.equal(createdPaymentRecord.customFields.collectorPhone,"9999999999");
    assert.equal(createdPaymentRecord.customFields.internalNote,"Internal note controlled by the business");
    const createdPaymentAudit=createdPayment.data.order.paymentHistory.at(-1);
    assert.equal(createdPaymentAudit.after.customFields.collectionEstimate,0.05);

    const invalidPaymentMetadata=await request(`/order/orders/${createdOrder.data.order._id}/pay`,{
      method:"POST",
      body:{
        amount:1,
        method:"Cash",
        amountReference:"META-RECEIPT-INVALID",
        paymentDate:"2026-10-31",
        customFields:{collectionShift:"Night"}
      }
    });
    assert.equal(invalidPaymentMetadata.status,400);
    assert.match(invalidPaymentMetadata.data.message,/available option/i);

    const updatedPayment=await request(
      `/order/orders/${createdOrder.data.order._id}/payments/${createdPaymentRecord._id}`,
      {
        method:"PUT",
        body:{
          amount:6,
          method:"UPI",
          amountReference:"META-RECEIPT-1",
          paymentDate:"2026-10-31",
          customFields:{
            collectionShift:"Evening",
            collectionEstimate:999,
            collectorPhone:"2222222222",
            internalNote:"Changed browser forgery"
          }
        }
      }
    );
    assert.equal(updatedPayment.status,200,JSON.stringify(updatedPayment.data));
    const updatedPaymentRecord=updatedPayment.data.order.payments.find(item=>String(item._id)===String(createdPaymentRecord._id));
    assert.equal(updatedPaymentRecord.amount,6);
    assert.equal(updatedPaymentRecord.customFields.collectionShift,"Evening");
    assert.equal(updatedPaymentRecord.customFields.collectionEstimate,0.06);
    assert.equal(updatedPaymentRecord.customFields.collectorPhone,"9999999999");
    assert.equal(updatedPaymentRecord.customFields.internalNote,"Internal note controlled by the business");
    const updatedPaymentAudit=updatedPayment.data.order.paymentHistory.at(-1);
    assert.equal(updatedPaymentAudit.before.customFields.collectionEstimate,0.05);
    assert.equal(updatedPaymentAudit.after.customFields.collectionEstimate,0.06);

    const rejectedPaymentReference=await request(
      `/order/orders/${createdOrder.data.order._id}/payments/${createdPaymentRecord._id}`,
      {
        method:"PUT",
        body:{
          amount:6,
          method:"UPI",
          amountReference:"META-RECEIPT-1",
          paymentDate:"2026-10-31",
          customFields:{collector:String(otherClientId)}
        }
      }
    );
    assert.equal(rejectedPaymentReference.status,400);
    assert.match(rejectedPaymentReference.data.message,/not found in this business/i);
    const paymentAfterRejectedUpdate=await Order.findOne({
      _id:createdOrder.data.order._id,
      createdBy:ownerId
    }).lean();
    const unchangedPayment=paymentAfterRejectedUpdate.payments.find(item=>String(item._id)===String(createdPaymentRecord._id));
    assert.equal(unchangedPayment.amount,6);
    assert.equal(unchangedPayment.customFields.collectorPhone,"9999999999");

    const createdBulkPayment=await request("/order/orders/payments/bulk",{
      method:"PUT",
      body:{
        method:"Bank",
        amountReference:"META-BULK-1",
        amount:2,
        splitType:"proportional",
        paymentDate:"2026-10-31",
        updates:[{orderId:String(createdOrder.data.order._id)}],
        customFields:{
          collectionShift:"Evening",
          collectionEstimate:999,
          collector:String(ownerClientId),
          collectorPhone:"forged bulk phone"
        }
      }
    });
    assert.equal(createdBulkPayment.status,200,JSON.stringify(createdBulkPayment.data));
    const orderAfterBulkPayment=await Order.findOne({
      _id:createdOrder.data.order._id,
      createdBy:ownerId
    }).lean();
    const bulkPaymentRecord=orderAfterBulkPayment.payments.at(-1);
    const bulkPaymentCustomFields=plainMap(bulkPaymentRecord.customFields);
    assert.equal(bulkPaymentRecord.method,"Bank");
    assert.equal(bulkPaymentCustomFields.collectionShift,"Evening");
    assert.equal(bulkPaymentCustomFields.collectionEstimate,0.02);
    assert.equal(bulkPaymentCustomFields.collector,String(ownerClientId));
    assert.equal(bulkPaymentCustomFields.collectorPhone,"9999999999");
    const bulkPaymentLog=await PaymentLog.findOne({
      userId:ownerId,
      reference:"META-BULK-1"
    }).lean();
    assert.ok(bulkPaymentLog);
    const bulkLogCustomFields=plainMap(bulkPaymentLog.customFields);
    assert.equal(bulkLogCustomFields.collectionShift,"Evening");
    assert.equal(bulkLogCustomFields.collectionEstimate,0.02);

    await FormConfiguration.create([
      {
        createdBy:ownerId,
        formKey:"products.form",
        fields:[
          {key:"productName",label:"Product name",fieldType:"text",required:true},
          {key:"rate",label:"Selling price",fieldType:"currency",required:true},
          {key:"quantity",label:"Current stock",fieldType:"number"},
          {key:"units",label:"Units",custom:true,fieldType:"number"},
          {key:"unitCost",label:"Unit cost",custom:true,fieldType:"currency"},
          {key:"calculatedValue",label:"Calculated value",custom:true,fieldType:"currency",formula:"units * unitCost",editable:false},
          {
            key:"supplier",
            label:"Supplier",
            custom:true,
            fieldType:"reference",
            dataSource:{
              type:"lookup",resource:"clients",valueField:"_id",labelField:"companyName",searchField:"companyName",
              autoFill:[{targetKey:"supplierPhone",sourceKey:"phone"}]
            }
          },
          {key:"supplierPhone",label:"Supplier phone",custom:true,fieldType:"phone",editable:false},
          {key:"protectedNote",label:"Protected note",custom:true,fieldType:"text",editable:false,defaultValue:"Managed by the business"}
        ]
      },
      {
        createdBy:ownerId,
        formKey:"calendar.event",
        fields:[
          {key:"title",label:"Event title",fieldType:"text",required:true},
          {key:"start",label:"Start",fieldType:"datetime",required:true},
          {key:"end",label:"End",fieldType:"datetime",required:true},
          {key:"color",label:"Color",fieldType:"text"},
          {key:"eventKind",label:"Event type",custom:true,fieldType:"select",options:["Meeting","Delivery"]},
          {
            key:"driverName",
            label:"Driver name",
            custom:true,
            fieldType:"text",
            conditions:[
              {action:"show",fieldKey:"eventKind",operator:"equals",value:"Delivery"},
              {action:"require",fieldKey:"eventKind",operator:"equals",value:"Delivery"}
            ]
          },
          {key:"units",label:"Units",custom:true,fieldType:"number"},
          {key:"unitRate",label:"Rate",custom:true,fieldType:"currency"},
          {key:"estimatedLoad",label:"Estimated load",custom:true,fieldType:"currency",formula:"units * unitRate",editable:false},
          {
            key:"customer",
            label:"Customer",
            custom:true,
            fieldType:"reference",
            dataSource:{
              type:"lookup",resource:"clients",valueField:"_id",labelField:"companyName",searchField:"companyName",
              autoFill:[{targetKey:"customerPhone",sourceKey:"phone"}]
            }
          },
          {key:"customerPhone",label:"Customer phone",custom:true,fieldType:"phone",editable:false},
          {key:"internalNote",label:"Internal note",custom:true,fieldType:"text",visible:false,defaultValue:"Business-only event note"}
        ]
      },
      {
        createdBy:ownerId,
        formKey:"ewaybill.form",
        fields:[
          {key:"supplyType",label:"Supply direction",fieldType:"text",required:false,options:["INVALID"]},
          {key:"transDistance",label:"Distance",fieldType:"number",validation:{min:5}},
          {key:"loadUnits",label:"Load units",custom:true,fieldType:"number"},
          {key:"unitWeight",label:"Unit weight",custom:true,fieldType:"currency"},
          {key:"totalWeight",label:"Total weight",custom:true,fieldType:"currency",formula:"loadUnits * unitWeight",editable:false},
          {
            key:"carrier",
            label:"Carrier",
            custom:true,
            fieldType:"reference",
            dataSource:{
              type:"lookup",resource:"clients",valueField:"_id",labelField:"companyName",searchField:"companyName",
              autoFill:[{targetKey:"carrierPhone",sourceKey:"phone"}]
            }
          },
          {key:"carrierPhone",label:"Carrier phone",custom:true,fieldType:"phone",editable:false}
        ]
      },
      {
        createdBy:ownerId,
        formKey:"profile.form",
        fields:[
          {key:"companyName",label:"Company name",fieldType:"text",required:true},
          {key:"gstin",label:"GSTIN",fieldType:"text",conditions:[
            {action:"show",fieldKey:"gstRegistered",operator:"equals",value:"true"},
            {action:"require",fieldKey:"gstRegistered",operator:"equals",value:"true"}
          ]},
          {key:"billNoSequence",label:"Next bill number",fieldType:"number",validation:{min:0}},
          {key:"eWayPassword",label:"E-Way Bill password",fieldType:"text"},
          {key:"gstRegistered",label:"GST registered",custom:true,fieldType:"boolean"},
          {key:"users",label:"Users",custom:true,fieldType:"number"},
          {key:"annualRate",label:"Annual rate",custom:true,fieldType:"currency"},
          {key:"annualValue",label:"Annual value",custom:true,fieldType:"currency",formula:"users * annualRate",editable:false},
          {key:"protectedNote",label:"Protected note",custom:true,fieldType:"text",editable:false,defaultValue:"Profile-controlled note"}
        ]
      },
      {
        createdBy:ownerId,
        formKey:"expenses.form",
        fields:[
          {key:"date",label:"Date",fieldType:"date",required:true},
          {key:"description",label:"Description",fieldType:"text",required:true},
          {key:"amount",label:"Amount",fieldType:"currency",required:true},
          {key:"category",label:"Category",fieldType:"select",required:true,options:[{value:"Operational",label:"Operational"},{value:"Production",label:"Production"}]},
          {key:"taxRate",label:"Tax rate",fieldType:"number"},
          {key:"taxAmount",label:"Tax amount",fieldType:"currency",formula:"amount * taxRate / 100",editable:false},
          {key:"taxDeductible",label:"Tax deductible",fieldType:"boolean"},
          {key:"isRecurring",label:"Recurring expense",fieldType:"boolean"},
          {key:"recurringInterval",label:"Recurring interval",fieldType:"select",options:["Daily","Weekly","Monthly","Yearly"],conditions:[{action:"show",fieldKey:"isRecurring",operator:"equals",value:"true"}]},
          {key:"recurringEndDate",label:"Recurring end date",fieldType:"date",conditions:[{action:"show",fieldKey:"isRecurring",operator:"equals",value:"true"}]},
          {key:"tags",label:"Tags",fieldType:"multiselect",options:["packing","urgent","fragile"]},
          {
            key:"clientId",
            label:"Customer",
            fieldType:"reference",
            dataSource:{type:"lookup",resource:"clients",valueField:"_id",labelField:"companyName",searchField:"companyName"}
          },
          {key:"units",label:"Units",custom:true,fieldType:"number"},
          {key:"unitCost",label:"Unit cost",custom:true,fieldType:"currency"},
          {key:"customTotal",label:"Custom total",custom:true,fieldType:"currency",formula:"units * unitCost",editable:false},
          {key:"protectedNote",label:"Protected note",custom:true,fieldType:"text",editable:false,defaultValue:"Expense note controlled by the business"}
        ]
      }
    ]);

    const createdProduct=await request("/products",{
      method:"POST",
      body:{
        productName:"Configured product",
        rate:50,
        quantity:5,
        customFields:{
          units:2,
          unitCost:7,
          calculatedValue:999,
          supplier:String(ownerClientId),
          supplierPhone:"1111111111",
          protectedNote:"Browser submitted value"
        }
      }
    });
    assert.equal(createdProduct.status,201,JSON.stringify(createdProduct.data));
    assert.equal(createdProduct.data.product.customFields.calculatedValue,14);
    assert.equal(createdProduct.data.product.customFields.supplier,String(ownerClientId));
    assert.equal(createdProduct.data.product.customFields.supplierPhone,"9999999999");
    assert.equal(createdProduct.data.product.customFields.protectedNote,"Managed by the business");
    assert.ok(createdProduct.data.product.productCode,"Product code is still generated by the server.");

    const updatedProduct=await request(`/products/${createdProduct.data.product._id}`,{
      method:"PUT",
      body:{
        rate:60,
        quantity:7,
        customFields:{
          units:3,
          unitCost:10,
          calculatedValue:999,
          supplierPhone:"2222222222",
          protectedNote:"Updated browser value"
        }
      }
    });
    assert.equal(updatedProduct.status,200,JSON.stringify(updatedProduct.data));
    assert.equal(updatedProduct.data.product.customFields.calculatedValue,30);
    assert.equal(updatedProduct.data.product.customFields.supplierPhone,"9999999999");
    assert.equal(updatedProduct.data.product.customFields.protectedNote,"Managed by the business");

    const rejectedProductReference=await request(`/products/${createdProduct.data.product._id}`,{
      method:"PUT",
      body:{customFields:{supplier:String(otherClientId),supplierPhone:"forged"}}
    });
    assert.equal(rejectedProductReference.status,400);
    assert.match(rejectedProductReference.data.message,/not found in this business/i);
    const productAfterRejectedReference=await request(`/products/${createdProduct.data.product._id}`);
    assert.equal(productAfterRejectedReference.status,200);
    assert.equal(productAfterRejectedReference.data.customFields.supplier,String(ownerClientId));
    assert.equal(productAfterRejectedReference.data.customFields.supplierPhone,"9999999999");

    const invalidExpenseCategory=await request("/expenses",{
      method:"POST",
      body:{
        date:"2026-10-31",
        description:"Invalid category expense",
        amount:10,
        category:"Not an expense category"
      }
    });
    assert.equal(invalidExpenseCategory.status,400);
    assert.match(invalidExpenseCategory.data.message,/available option/i);

    const recurringWithoutInterval=await request("/expenses",{
      method:"POST",
      body:{
        date:"2026-10-31",
        description:"Recurring expense without an interval",
        amount:10,
        category:"Operational",
        isRecurring:true
      }
    });
    assert.equal(recurringWithoutInterval.status,400);
    assert.match(recurringWithoutInterval.data.message,/recurring interval/i);

    const createdExpense=await request("/expenses",{
      method:"POST",
      body:{
        date:"2026-10-31",
        description:"Configured business expense",
        amount:100,
        category:"Operational",
        taxRate:18,
        taxAmount:999,
        taxDeductible:"false",
        isRecurring:"false",
        tags:["packing","urgent"],
        clientId:String(ownerClientId),
        customFields:{
          units:2,
          unitCost:5,
          customTotal:999,
          protectedNote:"Browser submitted expense note"
        },
        createdBy:String(otherOwnerId),
        user:String(otherOwnerId)
      }
    });
    assert.equal(createdExpense.status,201,JSON.stringify(createdExpense.data));
    assert.equal(createdExpense.data.amount,100);
    assert.equal(createdExpense.data.taxAmount,18,"Expense tax is recalculated by the server, not trusted from the browser.");
    assert.deepEqual(createdExpense.data.tags,["packing","urgent"]);
    assert.equal(createdExpense.data.taxDeductible,false);
    assert.equal(createdExpense.data.isRecurring,false,"String false must not be treated as a recurring expense.");
    assert.equal(String(createdExpense.data.createdBy),String(ownerId));
    assert.equal(String(createdExpense.data.user),String(ownerId));
    assert.equal(createdExpense.data.customFields.customTotal,10);
    assert.equal(createdExpense.data.customFields.protectedNote,"Expense note controlled by the business");

    const updatedExpense=await request(`/expenses/${createdExpense.data._id}`,{
      method:"PUT",
      body:{
        taxRate:10,
        tags:["packing","fragile"],
        customFields:{
          units:4,
          unitCost:5,
          customTotal:999,
          protectedNote:"Updated browser expense note"
        }
      }
    });
    assert.equal(updatedExpense.status,200,JSON.stringify(updatedExpense.data));
    assert.equal(updatedExpense.data.taxAmount,10);
    assert.deepEqual(updatedExpense.data.tags,["packing","fragile"]);
    assert.equal(updatedExpense.data.customFields.customTotal,20);
    assert.equal(updatedExpense.data.customFields.protectedNote,"Expense note controlled by the business");

    const rejectedExpenseReference=await request(`/expenses/${createdExpense.data._id}`,{
      method:"PUT",
      body:{clientId:String(otherClientId)}
    });
    assert.equal(rejectedExpenseReference.status,400);
    assert.match(rejectedExpenseReference.data.message,/not found in this business/i);
    const expenseAfterRejectedReference=await request(`/expenses/${createdExpense.data._id}`);
    assert.equal(expenseAfterRejectedReference.status,200);
    assert.equal(String(expenseAfterRejectedReference.data.clientId?._id),String(ownerClientId));

    const missingConditionalEventField=await request("/events",{
      method:"POST",
      body:{
        title:"Delivery event missing driver",
        start:"2026-10-31T03:30:00.000Z",
        end:"2026-10-31T04:00:00.000Z",
        customFields:{eventKind:"Delivery"}
      }
    });
    assert.equal(missingConditionalEventField.status,400);
    assert.match(missingConditionalEventField.data.message,/Driver name/i);

    const invalidCalendarChoice=await request("/events",{
      method:"POST",
      body:{
        title:"Event with invalid type",
        start:"2026-10-31T03:30:00.000Z",
        end:"2026-10-31T04:00:00.000Z",
        customFields:{eventKind:"Not an event type"}
      }
    });
    assert.equal(invalidCalendarChoice.status,400);
    assert.match(invalidCalendarChoice.data.message,/available option/i);

    const createdCalendarEvent=await request("/events",{
      method:"POST",
      body:{
        title:"Configured delivery event",
        start:"2026-10-31T03:30:00.000Z",
        end:"2026-10-31T04:00:00.000Z",
        color:"#ff9800",
        customFields:{
          eventKind:"Delivery",
          driverName:"Ravi",
          units:2,
          unitRate:5,
          estimatedLoad:999,
          customer:String(ownerClientId),
          customerPhone:"1111111111",
          internalNote:"Forged hidden note"
        }
      }
    });
    assert.equal(createdCalendarEvent.status,201,JSON.stringify(createdCalendarEvent.data));
    assert.equal(createdCalendarEvent.data.customFields.estimatedLoad,10);
    assert.equal(createdCalendarEvent.data.customFields.customer,String(ownerClientId));
    assert.equal(createdCalendarEvent.data.customFields.customerPhone,"9999999999");
    assert.equal(createdCalendarEvent.data.customFields.internalNote,"Business-only event note");

    const updatedCalendarEvent=await request(`/events/${createdCalendarEvent.data._id}`,{
      method:"PUT",
      body:{
        customFields:{
          units:3,
          unitRate:4,
          estimatedLoad:999,
          customerPhone:"2222222222",
          internalNote:"Updated browser forgery"
        }
      }
    });
    assert.equal(updatedCalendarEvent.status,200,JSON.stringify(updatedCalendarEvent.data));
    assert.equal(updatedCalendarEvent.data.customFields.estimatedLoad,12);
    assert.equal(updatedCalendarEvent.data.customFields.customerPhone,"9999999999");
    assert.equal(updatedCalendarEvent.data.customFields.internalNote,"Business-only event note");

    const rejectedCalendarReference=await request(`/events/${createdCalendarEvent.data._id}`,{
      method:"PUT",
      body:{customFields:{customer:String(otherClientId)}}
    });
    assert.equal(rejectedCalendarReference.status,400);
    assert.match(rejectedCalendarReference.data.message,/not found in this business/i);
    const calendarEventAfterRejectedUpdate=await CalendarEvent.findById(createdCalendarEvent.data._id).lean();
    assert.equal(String(calendarEventAfterRejectedUpdate.customFields.customer),String(ownerClientId));
    assert.equal(calendarEventAfterRejectedUpdate.customFields.customerPhone,"9999999999");

    const missingConditionalProfileGst=await request("/profile",{
      method:"PUT",
      body:{
        companyName:"GST registered business",
        customFields:{gstRegistered:true}
      }
    });
    assert.equal(missingConditionalProfileGst.status,400);
    assert.match(missingConditionalProfileGst.data.message,/GSTIN/i);

    const invalidOrganizationEmail=await request("/profile",{
      method:"PUT",
      body:{companyName:"Invalid email business",emailAddress:"not-an-email"}
    });
    assert.equal(invalidOrganizationEmail.status,400);
    assert.match(invalidOrganizationEmail.data.message,/valid organization email/i);

    const invalidOrganizationWebsite=await request("/profile",{
      method:"PUT",
      body:{companyName:"Invalid website business",website:"not a website"}
    });
    assert.equal(invalidOrganizationWebsite.status,400);
    assert.match(invalidOrganizationWebsite.data.message,/valid organization website/i);

    const invalidInvoiceSequence=await request("/profile",{
      method:"PUT",
      body:{companyName:"Invalid sequence business",billNoSequence:"1.5"}
    });
    assert.equal(invalidInvoiceSequence.status,400);
    assert.match(invalidInvoiceSequence.data.message,/whole number/i);

    const savedProfile=await request("/profile",{
      method:"PUT",
      body:{
        companyName:"Configured company",
        legalName:"Configured Legal Private Limited",
        organizationType:"Private Limited Company",
        industry:"Textile manufacturing",
        contactPerson:"Accounts Team",
        emailAddress:"accounts@example.com",
        website:"https://example.com",
        companyAddress:"Plot 12, Industrial Estate",
        addressLine2:"Near Main Road",
        city:"Vadodara",
        district:"Vadodara",
        state:"Gujarat",
        country:"India",
        cin:"U12345GJ2026PTC123456",
        tan:"ABCD12345E",
        udyamNumber:"UDYAM-GJ-00-0012345",
        gstin:"24ABCDE1234F1Z5",
        billNoSequence:"12",
        eWayUserName:"integration-user",
        eWayPassword:"integration-secret-password",
        customFields:{
          gstRegistered:true,
          users:3,
          annualRate:250,
          annualValue:999,
          protectedNote:"Forged profile note"
        },
        createdBy:String(otherOwnerId)
      }
    });
    assert.equal(savedProfile.status,200,JSON.stringify(savedProfile.data));
    assert.equal(savedProfile.data.companyName,"Configured company");
    assert.equal(savedProfile.data.legalName,"Configured Legal Private Limited");
    assert.equal(savedProfile.data.organizationType,"Private Limited Company");
    assert.equal(savedProfile.data.industry,"Textile manufacturing");
    assert.equal(savedProfile.data.contactPerson,"Accounts Team");
    assert.equal(savedProfile.data.emailAddress,"accounts@example.com");
    assert.equal(savedProfile.data.website,"https://example.com");
    assert.equal(savedProfile.data.addressLine2,"Near Main Road");
    assert.equal(savedProfile.data.city,"Vadodara");
    assert.equal(savedProfile.data.district,"Vadodara");
    assert.equal(savedProfile.data.state,"Gujarat");
    assert.equal(savedProfile.data.country,"India");
    assert.equal(savedProfile.data.cin,"U12345GJ2026PTC123456");
    assert.equal(savedProfile.data.tan,"ABCD12345E");
    assert.equal(savedProfile.data.udyamNumber,"UDYAM-GJ-00-0012345");
    assert.equal(savedProfile.data.billNoSequence,12);
    assert.equal(savedProfile.data.customFields.annualValue,750);
    assert.equal(savedProfile.data.customFields.protectedNote,"Profile-controlled note");
    assert.equal(savedProfile.data.createdBy,String(ownerId));
    assert.equal(savedProfile.data.eWayPassword,"");
    assert.equal(savedProfile.data.hasEWayPassword,true);
    assert.equal(JSON.stringify(savedProfile.data).includes("integration-secret-password"),false);

    const updatedProfile=await request("/profile",{
      method:"PUT",
      body:{
        companyName:"Configured company updated",
        billNoSequence:13,
        eWayPassword:"",
        customFields:{
          users:4,
          annualRate:100,
          annualValue:999,
          protectedNote:"Updated forged profile note"
        }
      }
    });
    assert.equal(updatedProfile.status,200,JSON.stringify(updatedProfile.data));
    assert.equal(updatedProfile.data.companyName,"Configured company updated");
    assert.equal(updatedProfile.data.legalName,"Configured Legal Private Limited","A partial profile update must retain unchanged organization details.");
    assert.equal(updatedProfile.data.emailAddress,"accounts@example.com","A partial profile update must retain contact information.");
    assert.equal(updatedProfile.data.billNoSequence,13);
    assert.equal(updatedProfile.data.customFields.annualValue,400);
    assert.equal(updatedProfile.data.customFields.protectedNote,"Profile-controlled note");
    assert.equal(updatedProfile.data.hasEWayPassword,true);
    const storedProfile=await Profile.findOne({createdBy:String(ownerId)}).lean();
    assert.equal(storedProfile.eWayPassword,"integration-secret-password","An empty update must keep the saved E-Way Bill password.");

    const preparedEwaybill=await prepareEwaybillForm({
      ownerId,
      body:{
        supplyType:"O",
        subSupplyType:"1",
        transactionType:"1",
        transMode:"1",
        vehicleType:"R",
        transDistance:"15",
        customFields:{
          loadUnits:2,
          unitWeight:3,
          totalWeight:999,
          carrier:String(ownerClientId),
          carrierPhone:"1111111111"
        }
      }
    });
    assert.equal(preparedEwaybill.values.supplyType,"O");
    assert.equal(preparedEwaybill.values.subSupplyType,"1");
    assert.equal(preparedEwaybill.values.transDistance,15);
    assert.equal(preparedEwaybill.customFields.totalWeight,6);
    assert.equal(preparedEwaybill.customFields.carrier,String(ownerClientId));
    assert.equal(preparedEwaybill.customFields.carrierPhone,"9999999999");

    await assert.rejects(
      ()=>prepareEwaybillForm({ownerId,body:{
        supplyType:"INVALID",
        subSupplyType:"1",
        transactionType:"1",
        transMode:"1",
        vehicleType:"R",
        transDistance:15
      }}),
      /available option/i
    );
    await assert.rejects(
      ()=>prepareEwaybillForm({ownerId,body:{
        supplyType:"O",
        subSupplyType:"1",
        transactionType:"1",
        transMode:"1",
        vehicleType:"R",
        transDistance:4
      }}),
      /must be at least 5/i
    );
    await assert.rejects(
      ()=>prepareEwaybillForm({ownerId,body:{
        supplyType:"O",
        subSupplyType:"1",
        transactionType:"1",
        transMode:"1",
        vehicleType:"R",
        transDistance:15,
        customFields:{carrier:String(otherClientId)}
      }}),
      /not found in this business/i
    );

    const tableKey="no-code-integration";
    const configured=await request(`/table-config/${tableKey}`,{
      method:"PUT",
      body:{columns:[
        {key:"custom_verified",label:"Verified",kind:"custom",fieldType:"boolean",editable:true},
        {key:"custom_note",label:"Internal note",kind:"custom",fieldType:"text",editable:true},
        {
          key:"custom_related_customer",
          label:"Related customer",
          kind:"custom",
          fieldType:"reference",
          editable:true,
          dataSource:{
            type:"lookup",
            resource:"clients",
            valueField:"_id",
            labelField:"companyName",
            searchField:"companyName"
          }
        }
      ]}
    });
    assert.equal(configured.status,200,JSON.stringify(configured.data));

    const invalidBoolean=await request(`/table-config/${tableKey}/values`,{
      method:"PUT",
      body:{rowKey:String(ownerClientId),fieldKey:"custom_verified",value:"maybe"}
    });
    assert.equal(invalidBoolean.status,400);
    assert.match(invalidBoolean.data.message,/choose yes or no/i);

    const savedFalse=await request(`/table-config/${tableKey}/values`,{
      method:"PUT",
      body:{rowKey:String(ownerClientId),fieldKey:"custom_verified",value:false}
    });
    assert.equal(savedFalse.status,200,JSON.stringify(savedFalse.data));
    assert.equal(savedFalse.data.value,false);

    const savedText=await request(`/table-config/${tableKey}/values`,{
      method:"PUT",
      body:{rowKey:String(ownerClientId),fieldKey:"custom_note",value:"Call before delivery"}
    });
    assert.equal(savedText.status,200,JSON.stringify(savedText.data));

    const crossBusinessReference=await request(`/table-config/${tableKey}/values`,{
      method:"PUT",
      body:{rowKey:String(ownerClientId),fieldKey:"custom_related_customer",value:String(otherClientId)}
    });
    assert.equal(crossBusinessReference.status,400);
    assert.match(crossBusinessReference.data.message,/belongs to your business account/i);

    const ownReference=await request(`/table-config/${tableKey}/values`,{
      method:"PUT",
      body:{rowKey:String(ownerClientId),fieldKey:"custom_related_customer",value:String(ownerClientId)}
    });
    assert.equal(ownReference.status,200,JSON.stringify(ownReference.data));

    const ownerValues=await request(`/table-config/${tableKey}/values?rowKeys=${ownerClientId}`);
    assert.equal(ownerValues.status,200);
    assert.equal(ownerValues.data.values.length,3);
    assert.equal(ownerValues.data.values.find(item=>item.fieldKey==="custom_verified").value,false);
    assert.equal(ownerValues.data.values.find(item=>item.fieldKey==="custom_note").value,"Call before delivery");
    assert.equal(ownerValues.data.values.find(item=>item.fieldKey==="custom_related_customer").value,String(ownerClientId));

    const resetTable=await request(`/table-config/${tableKey}`,{method:"DELETE"});
    assert.equal(resetTable.status,200);
    const resetLayout=await request(`/table-config/${tableKey}`);
    assert.deepEqual(resetLayout.data.columns,[]);
    const retainedValues=await request(`/table-config/${tableKey}/values?rowKeys=${ownerClientId}`);
    assert.equal(retainedValues.status,200);
    assert.equal(retainedValues.data.values.length,3);
    assert.equal(retainedValues.data.values.find(item=>item.fieldKey==="custom_verified").value,false);

    const hiddenFromOtherOwner=await request(`/table-config/${tableKey}/values?rowKeys=${ownerClientId}`,{
      token:otherOwnerToken
    });
    assert.equal(hiddenFromOtherOwner.status,200);
    assert.deepEqual(hiddenFromOtherOwner.data.values,[]);
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    if(mongoose.connection.readyState===1){
      if(ownerId&&otherOwnerId){
        await Promise.all([
          TableCustomValue.deleteMany({createdBy:{$in:[ownerId,otherOwnerId]}}),
          TableConfiguration.deleteMany({createdBy:{$in:[ownerId,otherOwnerId]}}),
          FormConfiguration.deleteMany({createdBy:{$in:[ownerId,otherOwnerId]}}),
          Client.deleteMany({createdBy:{$in:[ownerId,otherOwnerId]}}),
          Product.deleteMany({createdBy:{$in:[ownerId,otherOwnerId]}}),
          Expense.deleteMany({createdBy:{$in:[ownerId,otherOwnerId]}}),
          CalendarEvent.deleteMany({createdBy:{$in:[ownerId,otherOwnerId]}}),
          Profile.deleteMany({createdBy:{$in:[String(ownerId),String(otherOwnerId)]}})
        ]);
      }
      await mongoose.disconnect();
    }
  }
});
