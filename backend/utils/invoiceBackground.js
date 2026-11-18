const hasInvoiceBackgroundSignature=(buffer,mimeType)=>{
  if(!Buffer.isBuffer(buffer))return false;
  const type=String(mimeType||"").toLowerCase();
  if(type==="application/pdf")return buffer.length>=5&&buffer.subarray(0,5).toString("ascii")==="%PDF-";
  if(type==="image/png")return buffer.length>=8&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(type==="image/jpeg")return buffer.length>=3&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255;
  if(type==="image/webp")return buffer.length>=12&&buffer.subarray(0,4).toString("ascii")==="RIFF"&&buffer.subarray(8,12).toString("ascii")==="WEBP";
  return false;
};

module.exports={hasInvoiceBackgroundSignature};
