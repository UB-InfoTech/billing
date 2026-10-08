export const MODULE_CATALOG=[
  {key:"dashboard",label:"Dashboard",route:"/dashboard",icon:"bi-speedometer2",description:"Your business overview"},
  {key:"analytics",label:"Reports",route:"/analytics",icon:"bi-graph-up-arrow",description:"Sales and business reports"},
  {key:"orders",label:"Bills",route:"/orders",icon:"bi-receipt",description:"Create and manage bills"},
  {key:"clients",label:"Clients",route:"/clients",icon:"bi-people",description:"Customers and their details"},
  {key:"products",label:"Products",route:"/products",icon:"bi-box-seam",description:"Items and pricing"},
  {key:"expense",label:"Expenses",route:"/expense",icon:"bi-wallet2",description:"Business expenses"},
  {key:"calendar",label:"Calendar",route:"/calendar",icon:"bi-calendar3",description:"Important dates and reminders"},
  {key:"bulk-payment",label:"Payments",route:"/bulk-payment",icon:"bi-cash-stack",description:"Receive and manage payments"},
  {key:"credit-notes",label:"Credit Notes",route:"/credit-notes",icon:"bi-file-earmark-minus",description:"Returns and adjustments"},
  {key:"settings",label:"Settings",route:"/settings",icon:"bi-sliders2",description:"Customize your software"},
];

export const ORDER_FORM_FIELDS=[
 {key:"orderNumber",label:"Invoice No.",fieldType:"text",width:3,section:"shipping",required:true,order:0,system:true},
 {key:"clientId",label:"Client link",fieldType:"text",width:3,section:"client",order:999,visible:false,locked:false,system:true,editable:false,readOnly:true},
 {key:"orderDate",label:"Bill Date",fieldType:"date",width:4,section:"shipping",required:true,order:1,system:true},
 {key:"lrNo",label:"LR No.",fieldType:"text",width:5,section:"shipping",order:2},
 {key:"State",label:"State",fieldType:"text",width:4,section:"shipping",required:true,order:3},
 {key:"Address",label:"Address",fieldType:"text",width:8,section:"shipping",required:true,order:4},
 {key:"City",label:"City",fieldType:"text",width:4,section:"shipping",required:true,order:5},
 {key:"pinCode",label:"Pin Code",fieldType:"text",width:4,section:"shipping",order:6},
 {key:"stateCode",label:"State Code",fieldType:"text",width:4,section:"shipping",order:7},
 {key:"status",label:"Status",fieldType:"select",width:4,section:"shipping",order:8,options:["Pending","In Process","Completed","Cancelled","Dispatched"],system:true},
 {key:"companyName",label:"Company Name",fieldType:"reference",width:4,section:"client",required:true,order:9,system:true,dataSource:{type:"lookup",resource:"clients",valueField:"companyName",labelField:"companyName",searchField:"companyName",multiple:false,autoFill:[
  {targetKey:"clientId",sourceKey:"_id"},
  {targetKey:"Address",sourceKey:"address"},
  {targetKey:"State",sourceKey:"state"},
  {targetKey:"City",sourceKey:"city"},
  {targetKey:"pinCode",sourceKey:"pinCode"},
  {targetKey:"stateCode",sourceKey:"stateCode"},
  {targetKey:"gstNumber",sourceKey:"gstNumber"},
  {targetKey:"paymentTerms",sourceKey:"paymentTerms"},
  {targetKey:"discountRate",sourceKey:"discountRate"}
 ]}},
 {key:"gstNumber",label:"GST No.",fieldType:"text",width:4,section:"client",order:10},
 {key:"paymentTerms",label:"Payment Terms",fieldType:"select",width:4,section:"client",required:true,order:11,options:[{value:"30",label:"30 days"},{value:"60",label:"60 days"},{value:"90",label:"90 days"},{value:"Advance",label:"Advance"}],system:true},
 {key:"challanNumber",label:"Challan No.",fieldType:"text",width:4,section:"client",required:true,order:12,defaultValue:""},
 {key:"taxPercentage",label:"Tax %",fieldType:"number",width:4,section:"client",order:13,system:true},
 {key:"discountRate",label:"Discount %",fieldType:"number",width:4,section:"client",order:14,system:true}
];

export const ORDER_ITEM_FIELDS=[
 {key:"designNumber",label:"Design No.",fieldType:"text",width:2,section:"items",order:0},
 {key:"orderName",label:"Product Name",fieldType:"reference",width:2,section:"items",order:1,dataSource:{type:"lookup",resource:"products",valueField:"productName",labelField:"productName",searchField:"productName",multiple:false,autoFill:[{targetKey:"designNumber",sourceKey:"designNo"},{targetKey:"unitPrice",sourceKey:"rate"}]}},
 {key:"hsnCode",label:"HSN Code",fieldType:"number",width:2,section:"items",order:2},
 {key:"quantity",label:"Qty",fieldType:"number",width:1,section:"items",order:3},
 {key:"cut",label:"Cut",fieldType:"number",width:1,section:"items",order:4},
 {key:"MTR",label:"MTR",fieldType:"number",width:1,section:"items",order:5,formula:"quantity * cut"},
 {key:"unitPrice",label:"Rate",fieldType:"currency",width:1,section:"items",order:6},
 {key:"qtyUnit",label:"Qty Unit",fieldType:"select",width:1,section:"items",order:7,options:["MTR","PCS","BOX","UNT"]},
 {key:"shortPcs",label:"Short Pcs",fieldType:"number",width:1,section:"items",order:8,visible:false}
];

export const CLIENT_FORM_FIELDS=[
  {key:"name",label:"Client Name",fieldType:"text",width:12,section:"basic",order:0,system:true},
  {key:"email",label:"Email",fieldType:"text",width:6,section:"basic",order:1},
  {key:"phone",label:"Phone",fieldType:"text",width:6,section:"basic",order:2},
  {key:"address",label:"Address",fieldType:"textarea",width:6,section:"address",required:true,order:3},
  {key:"pinCode",label:"Pin Code",fieldType:"text",width:3,section:"address",required:true,order:4},
  {key:"stateCode",label:"State Code",fieldType:"text",width:3,section:"address",required:true,order:5},
  {key:"state",label:"State",fieldType:"select",width:6,section:"address",required:true,order:6},
  {key:"city",label:"City",fieldType:"select",width:6,section:"address",order:7},
  {key:"gstNumber",label:"GST Number",fieldType:"text",width:6,section:"business",required:true,order:8,system:true},
  {key:"companyName",label:"Company Name",fieldType:"text",width:6,section:"business",required:true,order:9,system:true},
  {key:"businessType",label:"Business Type",fieldType:"select",width:6,section:"business",order:10,options:["Retail","Wholesale","Manufacturer","Trader","Supplier"]},
  {key:"paymentTerms",label:"Payment Terms",fieldType:"select",width:6,section:"business",required:true,order:11,options:[{value:"30",label:"30 days"},{value:"60",label:"60 days"},{value:"90",label:"90 days"},{value:"Advance",label:"Advance Payment"}],system:true},
  {key:"discountRate",label:"Discount Rate",fieldType:"number",width:4,section:"additional",order:12,system:true},
  {key:"accountStatus",label:"Account Status",fieldType:"select",width:8,section:"additional",order:13,options:["Active","Inactive"],system:true},
  {key:"notes",label:"Notes",fieldType:"textarea",width:12,section:"additional",order:14}
];


export const PRODUCT_FORM_FIELDS=[
 {key:"productName",label:"Product Name",fieldType:"text",width:6,section:"basic",required:true,order:0,system:true},
 {key:"productCode",label:"Product Code",fieldType:"text",width:3,section:"basic",order:1,system:true},
 {key:"designNo",label:"Design No.",fieldType:"text",width:3,section:"basic",order:2},
 {key:"rate",label:"Selling Rate",fieldType:"currency",width:4,section:"pricing",required:true,order:3,system:true},
 {key:"purchasePrice",label:"Purchase Price",fieldType:"currency",width:4,section:"pricing",order:4},
 {key:"minStock",label:"Minimum Stock",fieldType:"number",width:4,section:"stock",order:5},
 {key:"quantity",label:"Current Stock",fieldType:"number",width:4,section:"stock",order:6},
 {key:"serialNumber",label:"Serial Number",fieldType:"text",width:4,section:"stock",order:7},
 {key:"barcode",label:"Barcode",fieldType:"text",width:4,section:"stock",order:8},
 {key:"purchaseDate",label:"Purchase Date",fieldType:"date",width:4,section:"stock",order:9},
 {key:"description",label:"Description",fieldType:"textarea",width:12,section:"details",order:10}
];


export const EXPENSE_FORM_FIELDS=[
 {key:"date",label:"Date",fieldType:"date",width:4,section:"basic",required:true,order:0,system:true},
 {key:"title",label:"Title",fieldType:"text",width:4,section:"basic",order:1},
 {key:"description",label:"Description",fieldType:"textarea",width:4,section:"basic",required:true,order:2,system:true},
 {key:"amount",label:"Amount",fieldType:"currency",width:4,section:"amount",required:true,order:3,system:true},
 {key:"category",label:"Category",fieldType:"select",width:4,section:"classification",required:true,order:4,options:["Production","Operational","Marketing","Financial","Miscellaneous","Raw Materials","Labor","Maintenance","Shipping","Utilities","Rent","Other"]},
 {key:"subCategory",label:"Sub Category",fieldType:"text",width:4,section:"classification",order:5},
 {key:"tags",label:"Tags",fieldType:"text",width:4,section:"classification",order:6},
 {key:"paymentMethod",label:"Payment Method",fieldType:"select",width:4,section:"payment",order:7,options:["Cash","Bank Transfer","UPI","Cheque","Credit"]},
 {key:"currency",label:"Currency",fieldType:"text",width:4,section:"payment",order:8,defaultValue:"INR"},
 {key:"vendor",label:"Vendor",fieldType:"text",width:4,section:"payment",order:9},
 {key:"gstNo",label:"GST Number",fieldType:"text",width:4,section:"tax",order:10},
 {key:"taxDeductible",label:"Tax Deductible",fieldType:"boolean",width:4,section:"tax",order:11},
 {key:"taxRate",label:"Tax Rate %",fieldType:"number",width:4,section:"tax",order:12},
 {key:"taxAmount",label:"Tax Amount",fieldType:"currency",width:4,section:"tax",order:13,formula:"amount * taxRate / 100"},
 {key:"clientId",label:"Client",fieldType:"reference",width:6,section:"links",order:14,dataSource:{type:"lookup",resource:"clients",valueField:"_id",labelField:"companyName",searchField:"companyName",multiple:false}},
 {key:"orderId",label:"Invoice / Order",fieldType:"reference",width:6,section:"links",order:15,dataSource:{type:"lookup",resource:"orders",valueField:"_id",labelField:"orderNumber",searchField:"orderNumber",multiple:false}},
 {key:"isRecurring",label:"Recurring Expense",fieldType:"boolean",width:4,section:"recurring",order:16},
 {key:"recurringInterval",label:"Recurring Interval",fieldType:"select",width:4,section:"recurring",order:17,options:["Daily","Weekly","Monthly","Yearly"],conditions:[{action:"show",fieldKey:"isRecurring",operator:"equals",value:"true"}]},
 {key:"recurringEndDate",label:"Recurrence End Date",fieldType:"date",width:4,section:"recurring",order:18,conditions:[{action:"show",fieldKey:"isRecurring",operator:"equals",value:"true"}]},
 {key:"notes",label:"Notes",fieldType:"textarea",width:12,section:"details",order:19}
];

export const CALENDAR_EVENT_FIELDS=[
 {key:"title",label:"Event Title",fieldType:"text",width:6,section:"event",required:true,order:0,system:true},
 {key:"start",label:"Start",fieldType:"datetime",width:3,section:"event",required:true,order:1,system:true},
 {key:"end",label:"End",fieldType:"datetime",width:3,section:"event",required:true,order:2,system:true},
 {key:"color",label:"Color",fieldType:"text",width:4,section:"appearance",order:3,defaultValue:"#3788d8"},
];

export const FORM_CATALOG=[
  {key:"orders.form",label:"Bill information",page:"/orders",query:"form",description:"Arrange bill fields, add your own fields, links, rules and calculations.",fields:ORDER_FORM_FIELDS},
  {key:"orders.items",label:"Bill items",page:"/orders",query:"items",description:"Arrange item columns and create calculations such as quantity × rate.",fields:ORDER_ITEM_FIELDS},
  {key:"clients.form",label:"Client form",page:"/clients",query:"form",description:"Customize customer details, linked records and conditional fields.",fields:CLIENT_FORM_FIELDS},
  {key:"products.form",label:"Product form",page:"/products",query:"form",description:"Customize product details, pricing, stock and your own business fields.",fields:PRODUCT_FORM_FIELDS},
  {key:"expenses.form",label:"Expense form",page:"/add-expense",query:"form",description:"Customize expense details, tax, links, recurring rules and your own business fields.",fields:EXPENSE_FORM_FIELDS},
  {key:"calendar.event",label:"Calendar event form",page:"/calendar",query:"form",description:"Customize event details and add your own event information.",fields:CALENDAR_EVENT_FIELDS},
];

export const TABLE_CATALOG=[
  {key:"orders.list",label:"Bills list",page:"/orders",description:"Choose columns, reorder them and add custom business columns."},
  {key:"clients.list",label:"Clients list",page:"/clients",description:"Simplify the customer list and show the information your team needs."},
  {key:"products.list",label:"Products list",page:"/products",description:"Choose the product columns your team needs and add custom columns."},
  {key:"expenses.list",label:"Expenses list",page:"/expense",description:"Choose the expense columns your team needs and add custom columns."},
  {key:"calendar.events",label:"Calendar events",page:"/calendar",description:"Choose the columns shown in the event list and add custom columns."},
  {key:"sales-analytics.orders",label:"Report order list",page:"/analytics",description:"Choose the columns shown in the report order list and add custom columns."},
  {key:"sales-analytics.state-cities",label:"State city list",page:"/analytics",query:"state-table",description:"Choose the columns shown when you open a state on the sales map."},
];

export const WORKFLOW_RESOURCES=[
  {key:"orders",label:"Bills"},
  {key:"clients",label:"Clients"},
  {key:"products",label:"Products"},
  {key:"expenses",label:"Expenses"}
];

export const WORKFLOW_EVENTS=[
  {key:"record_created",label:"A new record is created"},
  {key:"record_updated",label:"A record is updated"}
];

export const WORKFLOW_OPERATORS=[
  {value:"equals",label:"is"},
  {value:"not_equals",label:"is not"},
  {value:"contains",label:"contains"},
  {value:"not_contains",label:"does not contain"},
  {value:"greater_than",label:"is greater than"},
  {value:"less_than",label:"is less than"},
  {value:"empty",label:"is empty"},
  {value:"not_empty",label:"is not empty"}
];

export const workflowSourceLabels={
  orders:{orderNumber:"Invoice No.",companyName:"Client",status:"Status",paymentStatus:"Payment Status",discountRate:"Discount %",taxPercentage:"Tax %",dueAmount:"Due Amount",roundOffFinalRevenue:"Invoice Total"},
  clients:{name:"Client Name",companyName:"Company Name",businessType:"Business Type",accountStatus:"Account Status",paymentTerms:"Payment Terms",discountRate:"Discount Rate"},
  products:{productName:"Product Name",productCode:"Product Code",rate:"Rate",quantity:"Stock"},
  expenses:{title:"Title",category:"Category",amount:"Amount",paymentMethod:"Payment Method"}
};

export const workflowFieldsFor=resource=>{
  const fields=workflowSourceLabels[resource]||{};
  return Object.entries(fields).map(([value,label])=>({value,label}));
};
