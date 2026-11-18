const FIELD_HINTS = [
  {fieldKey:"invoice_no",label:"Invoice number",pattern:/\b(invoice|inv\.?|bill)\s*(no\.?|number|num|#)\b/i},
  {fieldKey:"challan_no",label:"Challan number",pattern:/\b(challan|delivery\s*challan)\s*(no\.?|number|#)\b/i},
  {fieldKey:"eway_bill",label:"E-Way Bill",pattern:/\b(e[\s-]?way)\s*bill\b/i},
  {fieldKey:"invoice_date",label:"Invoice date",pattern:/\b(invoice|bill)\s*date\b|\bdate\s*of\s*(invoice|billing)\b/i},
  {fieldKey:"due_date",label:"Due date",pattern:/\b(due\s*date|payment\s*due|last\s*date\s*of\s*payment)\b/i},
  {fieldKey:"customer_address",label:"Customer address",pattern:/\b(customer|buyer|billing|consignee)\s*address\b|\bship\s*to\b/i},
  {fieldKey:"company_address",label:"Business address",pattern:/\b(seller|supplier|vendor|company|business)\s*address\b/i},
  {fieldKey:"customer_name",label:"Customer name",pattern:/\b(bill\s*to|buyer\s+name|customer\s+name|consignee\s+name)\b/i},
  {fieldKey:"company_name",label:"Business name",pattern:/\b(seller|supplier|vendor|company|business)\s+name\b|\bbill\s*from\b|\bfrom\s*:\s*/i},
  {fieldKey:"customer_phone",label:"Customer phone",pattern:/\b(customer|buyer|consignee)\s*(phone|mobile|contact)\b/i},
  {fieldKey:"company_phone",label:"Business phone",pattern:/\b(seller|supplier|company|business)\s*(phone|mobile|contact)\b/i},
  {fieldKey:"customer_gstin",label:"Customer GSTIN",pattern:/\b(buyer|customer|consignee)\s*(gst|gstin|gst\s*no)\b/i},
  {fieldKey:"company_gstin",label:"Business GSTIN",pattern:/\b(seller|supplier|vendor|company)\s*(gst|gstin|gst\s*no)\b/i},
  {fieldKey:"discount",label:"Discount",pattern:/\b(discount|less\s*discount)\b/i},
  {fieldKey:"taxable_value",label:"Taxable value",pattern:/\b(taxable\s*(value|amount)|taxable\s*total)\b/i},
  {fieldKey:"cgst",label:"CGST",pattern:/\bcgst\b/i},
  {fieldKey:"sgst",label:"SGST",pattern:/\bsgst\b/i},
  {fieldKey:"igst",label:"IGST",pattern:/\bigst\b/i},
  {fieldKey:"subtotal",label:"Subtotal",pattern:/\b(sub\s*total|subtotal)\b/i},
  {fieldKey:"grand_total",label:"Invoice total",pattern:/\b(grand\s*total|invoice\s*total|net\s*amount|total\s*payable)\b/i},
  {fieldKey:"amount_paid",label:"Amount paid",pattern:/\b(amount\s*paid|paid\s*amount|total\s*paid)\b/i},
  {fieldKey:"balance_due",label:"Balance due",pattern:/\b(balance\s*due|amount\s*due|pending\s*amount)\b/i},
  {fieldKey:"bank_details",label:"Bank details",pattern:/\b(bank\s*details|bank\s*name|account\s*(no|number)|ifsc)\b/i},
  {fieldKey:"terms",label:"Terms and conditions",pattern:/\b(terms\s*(and|&)?\s*conditions|payment\s*terms)\b/i},
  {fieldKey:"signature",label:"Authorised signatory",pattern:/\b(authori[sz]ed\s*signatory|signature|receiver'?s\s*sign)\b/i},
  {fieldKey:"invoice_title",label:"Invoice title",pattern:/\b(tax\s*invoice|invoice)\b/i}
];

function suggestInvoiceField(text,{top=50}={}){
  const value=String(text||"").replace(/\s+/g," ").trim();
  if(!value)return null;
  for(const hint of FIELD_HINTS){
    if(hint.pattern.test(value))return {fieldKey:hint.fieldKey,label:hint.label};
  }
  if(/\b(gstin|gst\s*no\.?|goods\s*and\s*services\s*tax)\b/i.test(value)){
    const seller=/seller|supplier|vendor|company|business/i.test(value)||Number(top)<24;
    return seller
      ?{fieldKey:"company_gstin",label:"Business GSTIN"}
      :{fieldKey:"customer_gstin",label:"Customer GSTIN"};
  }
  if(/\b(phone|mobile|contact)\b/i.test(value)){
    return Number(top)<24
      ?{fieldKey:"company_phone",label:"Business phone"}
      :{fieldKey:"customer_phone",label:"Customer phone"};
  }
  if(/\baddress\b/i.test(value)){
    return Number(top)<24
      ?{fieldKey:"company_address",label:"Business address"}
      :{fieldKey:"customer_address",label:"Customer address"};
  }
  if(/^\s*(date|dated)\s*[:-]?$/i.test(value)){
    return {fieldKey:"invoice_date",label:"Invoice date"};
  }
  return null;
}

function unionBoxes(words){
  const boxes=(words||[]).map(word=>word?.bbox).filter(box=>
    box&&Number.isFinite(Number(box.x0))&&Number.isFinite(Number(box.y0))
    &&Number.isFinite(Number(box.x1))&&Number.isFinite(Number(box.y1))
  );
  if(!boxes.length)return null;
  return {
    x0:Math.min(...boxes.map(box=>Number(box.x0))),
    y0:Math.min(...boxes.map(box=>Number(box.y0))),
    x1:Math.max(...boxes.map(box=>Number(box.x1))),
    y1:Math.max(...boxes.map(box=>Number(box.y1)))
  };
}

function normalizeBox(box,width,height){
  if(!box||!Number.isFinite(Number(box.x0))||!Number.isFinite(Number(box.y0))
    ||!Number.isFinite(Number(box.x1))||!Number.isFinite(Number(box.y1)))return null;
  const x=Math.max(0,Math.min(100,Number(box.x0)/width*100));
  const y=Math.max(0,Math.min(100,Number(box.y0)/height*100));
  const right=Math.max(x,Math.min(100,Number(box.x1)/width*100));
  const bottom=Math.max(y,Math.min(100,Number(box.y1)/height*100));
  return {x,y,w:right-x,h:bottom-y};
}

function boxFromNormalizedWords(words){
  const boxes=(words||[]).map(word=>word?.box).filter(box=>
    box&&[box.x,box.y,box.w,box.h].every(value=>Number.isFinite(Number(value)))
    &&Number(box.w)>0&&Number(box.h)>0
  );
  if(!boxes.length)return null;
  const x=Math.min(...boxes.map(box=>Number(box.x)));
  const y=Math.min(...boxes.map(box=>Number(box.y)));
  const right=Math.max(...boxes.map(box=>Number(box.x)+Number(box.w)));
  const bottom=Math.max(...boxes.map(box=>Number(box.y)+Number(box.h)));
  return {x,y,w:right-x,h:bottom-y};
}

function buildValuePlacementBox(sourceBox,fieldKey){
  if(!sourceBox||sourceBox.w<=0||sourceBox.h<=0)return null;
  const wideField=/address|terms|bank_details|amount_words/i.test(fieldKey);
  const nameField=/_name$/.test(fieldKey);
  const minWidth=wideField?25:nameField?20:14;
  const w=Math.min(48,Math.max(minWidth,sourceBox.w*1.45+2));
  const h=Math.min(9,Math.max(3.2,sourceBox.h+1.2));
  const x=Math.max(0,Math.min(100-w,sourceBox.x-0.35));
  const centerY=sourceBox.y+sourceBox.h/2;
  const y=Math.max(0,Math.min(100-h,centerY-h/2));
  return {x,y,w,h};
}

function inferOcrValueBox(line,allLines=[]){
  const fieldKey=line?.fieldKey||line?.selectedField||"";
  if(!fieldKey||!line?.box||Number(line.confidence||0)<35)return null;
  const words=(line.words||[]).filter(word=>String(word?.text||"").trim());
  for(let prefixLength=1;prefixLength<words.length;prefixLength+=1){
    const prefix=words.slice(0,prefixLength).map(word=>word.text).join(" ");
    const match=suggestInvoiceField(prefix,{top:line.box.y});
    if(match?.fieldKey!==fieldKey)continue;
    const valueWords=words.slice(prefixLength).filter(word=>
      word.box&&Number(word.confidence||0)>=35&&/[\p{L}\p{N}]/u.test(String(word.text||""))
    );
    const valueBox=boxFromNormalizedWords(valueWords);
    if(valueBox)return buildValuePlacementBox(valueBox,fieldKey);
    break;
  }

  const lineRight=line.box.x+line.box.w;
  const lineCenter=line.box.y+line.box.h/2;
  const nearby=(allLines||[]).filter(candidate=>{
    if(!candidate||candidate.id===line.id||candidate.fieldKey||!candidate.box)return false;
    if(Number(candidate.confidence||0)<45||String(candidate.text||"").length>80)return false;
    const candidateCenter=candidate.box.y+candidate.box.h/2;
    const verticalTolerance=Math.max(1.4,Math.max(line.box.h,candidate.box.h)*1.6);
    const horizontalGap=candidate.box.x-lineRight;
    return horizontalGap>=-0.6&&horizontalGap<=24&&Math.abs(candidateCenter-lineCenter)<=verticalTolerance;
  }).sort((a,b)=>{
    const score=item=>Math.abs((item.box.y+item.box.h/2)-lineCenter)+Math.max(0,item.box.x-lineRight)*0.015;
    return score(a)-score(b);
  });
  const adjacent=nearby[0];
  if(adjacent){
    const box={...adjacent.box};
    return buildValuePlacementBox(box,fieldKey);
  }
  return null;
}

function extractOcrLines(data,width,height){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return [];
  const lines=[];
  (data?.blocks||[]).forEach(block=>{
    (block.paragraphs||[]).forEach(paragraph=>{
      (paragraph.lines||[]).forEach(line=>{
        const words=line.words||[];
        const text=String(line.text||words.map(word=>word.text||"").join(" ")).replace(/\s+/g," ").trim();
        if(text.length<2)return;
        const bbox=line.bbox||unionBoxes(words);
        const confidence=words.length
          ?words.reduce((sum,word)=>sum+Number(word.confidence||0),0)/words.length
          :Number(line.confidence||0);
        const normalizedBox=normalizeBox(bbox,width,height);
        const suggestion=suggestInvoiceField(text,{top:normalizedBox?.y??50});
        lines.push({
          id:"ocr-"+lines.length,
          text:text.slice(0,180),
          confidence:Math.max(0,Math.min(100,confidence)),
          box:normalizedBox,
          words:words.map(word=>({
            text:String(word.text||""),
            confidence:Math.max(0,Math.min(100,Number(word.confidence||0))),
            box:normalizeBox(word.bbox,width,height)
          })),
          fieldKey:suggestion?.fieldKey||"",
          fieldLabel:suggestion?.label||""
        });
      });
    });
  });
  if(lines.length){
    lines.sort((a,b)=>(a.box?.y??100)-(b.box?.y??100)||(a.box?.x??0)-(b.box?.x??0));
    lines.forEach(line=>{line.valueBox=inferOcrValueBox(line,lines);});
    return lines.slice(0,60);
  }
  const fallback=String(data?.text||"").split(/\r?\n/).map(text=>text.trim()).filter(text=>text.length>=2);
  return fallback.slice(0,60).map((text,index)=>{
    const suggestion=suggestInvoiceField(text);
    return {id:"ocr-"+index,text:text.slice(0,180),confidence:0,box:null,words:[],valueBox:null,fieldKey:suggestion?.fieldKey||"",fieldLabel:suggestion?.label||""};
  });
}

export {extractOcrLines,inferOcrValueBox,suggestInvoiceField};
