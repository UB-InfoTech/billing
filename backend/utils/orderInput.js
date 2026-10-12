const ORDER_CREATE_FIELDS=Object.freeze([
  "challanNumber","lrNo","orderDate","subOrders","clientId","Address","State",
  "City","pinCode","stateCode","gstNumber","companyName","status",
  "paymentTerms","taxPercentage","discountRate","note","customFields"
]);

const SUB_ORDER_INPUT_FIELDS=Object.freeze([
  "productId","designNumber","orderName","hsnCode","qtyUnit",
  "quantity","cut","MTR","unitPrice","shortPcs","customFields"
]);

function cleanCustomFields(value){
  if(!value||typeof value!=="object"||Array.isArray(value))return {};
  return Object.fromEntries(
    Object.entries(value)
      .slice(0,100)
      .map(([key,item])=>[String(key).slice(0,100),item])
  );
}

function sanitizeSubOrderInputs(items){
  return (Array.isArray(items)?items:[]).map(item=>{
    const source=item&&typeof item==="object"&&!Array.isArray(item)?item:{};
    const clean={};
    SUB_ORDER_INPUT_FIELDS.forEach(key=>{
      if(source[key]!==undefined){
        clean[key]=key==="customFields"?cleanCustomFields(source[key]):source[key];
      }
    });
    clean.customFields=cleanCustomFields(clean.customFields);
    return clean;
  });
}

/**
 * Limit invoice creation to fields the entry form is allowed to provide.
 * Payment records, applied credit, persisted totals and ownership are managed
 * by their dedicated business workflows instead.
 */
function sanitizeOrderCreateInput(input){
  const source=input&&typeof input==="object"&&!Array.isArray(input)?input:{};
  const clean={};
  ORDER_CREATE_FIELDS.forEach(key=>{
    if(source[key]!==undefined){
      if(key==="customFields")clean.customFields=cleanCustomFields(source.customFields);
      else if(key==="subOrders")clean.subOrders=sanitizeSubOrderInputs(source.subOrders);
      else clean[key]=source[key];
    }
  });
  clean.customFields=cleanCustomFields(clean.customFields);
  return clean;
}

module.exports={
  ORDER_CREATE_FIELDS,
  SUB_ORDER_INPUT_FIELDS,
  cleanCustomFields,
  sanitizeSubOrderInputs,
  sanitizeOrderCreateInput
};
