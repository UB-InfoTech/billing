const test=require("node:test");
const assert=require("node:assert/strict");
const {numberToWords,integerToWords}=require("../utils/numberToWords");

test("writes whole-rupee invoice totals in words",()=>{
  assert.equal(numberToWords(850),"Eight Hundred Fifty Rupees Only");
});

test("includes paise in payment receipts",()=>{
  assert.equal(numberToWords(120.5),"One Hundred Twenty Rupees and Fifty Paise Only");
  assert.equal(numberToWords(120.05),"One Hundred Twenty Rupees and Five Paise Only");
});

test("rounds floating point amounts to the nearest paise",()=>{
  assert.equal(numberToWords(100.109),"One Hundred Rupees and Eleven Paise Only");
});

test("handles lakh and crore values using Indian number groups",()=>{
  assert.equal(integerToWords(125000),"One Lakh Twenty Five Thousand");
  assert.equal(numberToWords(15000000),"One Crore Fifty Lakh Rupees Only");
});

test("handles zero, invalid and negative amounts safely",()=>{
  assert.equal(numberToWords(0),"Zero Rupees Only");
  assert.equal(numberToWords("bad"),"Zero Rupees Only");
  assert.equal(numberToWords(-1.25),"Minus One Rupee and Twenty Five Paise Only");
});
