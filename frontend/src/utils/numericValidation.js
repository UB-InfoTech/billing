// Normalize historical form settings that accidentally stored an empty
// maximum as zero. A zero maximum would prevent any positive amount/quantity.
export const normalizeNumericValidation=(fieldType,validation={})=>{
  const current=validation&&typeof validation==="object"?validation:{};
  const rawMax=current.max??null;
  const legacyZeroMaximum=["number","currency"].includes(fieldType)
    &&rawMax!==null
    &&String(rawMax).trim()!==""
    &&Number(rawMax)===0;
  return {
    min:current.min??null,
    max:legacyZeroMaximum?null:rawMax,
    pattern:current.pattern||""
  };
};
