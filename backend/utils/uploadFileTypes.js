const EXTENSIONS_BY_MIME=Object.freeze({
  "image/jpeg":".jpg",
  "image/png":".png",
  "image/webp":".webp",
  "image/gif":".gif",
  "application/pdf":".pdf",
});

function getSafeUploadExtension(mimeType){
  return EXTENSIONS_BY_MIME[String(mimeType||"").toLowerCase()]||null;
}

function isAllowedUploadType(mimeType,allowPdf=false){
  const extension=getSafeUploadExtension(mimeType);
  return Boolean(extension)&&(allowPdf||extension!==".pdf");
}

module.exports={getSafeUploadExtension,isAllowedUploadType};
