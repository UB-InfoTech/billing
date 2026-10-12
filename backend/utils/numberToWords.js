const ONES=[
  "Zero","One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
  "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen",
  "Seventeen","Eighteen","Nineteen"
];
const TENS=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];

function integerToWords(value){
  const number=Math.floor(Number(value));
  if(!Number.isFinite(number)||number<0)return "";
  if(number<20)return ONES[number];
  if(number<100){
    return TENS[Math.floor(number/10)]+(number%10? ` ${ONES[number%10]}`:"");
  }

  const scales=[
    [10000000,"Crore"],
    [100000,"Lakh"],
    [1000,"Thousand"]
  ];
  for(const [scale,label] of scales){
    if(number>=scale){
      const quotient=Math.floor(number/scale);
      const remainder=number%scale;
      return `${integerToWords(quotient)} ${label}${remainder? ` ${integerToWords(remainder)}`:""}`;
    }
  }

  const hundreds=Math.floor(number/100);
  const remainder=number%100;
  return `${ONES[hundreds]} Hundred${remainder? ` ${integerToWords(remainder)}`:""}`;
}

function numberToWords(amount){
  const value=Number(amount);
  if(!Number.isFinite(value))return "Zero Rupees Only";

  const totalPaise=Math.round(Math.abs(value)*100);
  const rupees=Math.floor(totalPaise/100);
  const paise=totalPaise%100;
  const prefix=value<0?"Minus ":"";
  const rupeeWords=integerToWords(rupees);
  const rupeeLabel=rupees===1?"Rupee":"Rupees";
  const paiseLabel=paise===1?"Paisa":"Paise";

  if(paise>0){
    return `${prefix}${rupeeWords} ${rupeeLabel} and ${integerToWords(paise)} ${paiseLabel} Only`;
  }
  return `${prefix}${rupeeWords} ${rupeeLabel} Only`;
}

module.exports={numberToWords,integerToWords};
