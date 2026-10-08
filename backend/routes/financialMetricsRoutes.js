const express=require("express");
const mongoose=require("mongoose");
const Order=require("../models/Order2");
const Expense=require("../models/Expense");
const Product=require("../models/Product");
const ReportConfiguration=require("../models/ReportConfiguration");
const auth=require("../middleware/auth");

const router=express.Router();
const owner=req=>req.user.id;
const round2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;
const ratio=(a,b)=>b?round2(Number(a||0)/Number(b)):null;
const pct=(a,b)=>b?round2(Number(a||0)*100/Number(b)):null;
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const dateRange=(start,end)=>{const r={};if(start){const d=new Date(String(start)+"T00:00:00.000");if(!Number.isNaN(d.getTime()))r.$gte=d;}if(end){const d=new Date(String(end)+"T23:59:59.999");if(!Number.isNaN(d.getTime()))r.$lte=d;}return Object.keys(r).length?r:null;};

const inputKeys=["depreciation","amortization","interestExpense","incomeTax","otherIncome","otherExpenses","equity","averageEquity","totalAssets","averageAssets","currentAssets","currentLiabilities","cash","accountsReceivable","averageReceivables","inventory","averageInventory","accountsPayable","averagePayables","debt","principalRepayments","weightedAverageShares","sharesOutstanding","marketPricePerShare","dividends","capitalExpenditure","operatingCashFlow","investingCashFlow","financingCashFlow","variableCosts","fixedOperatingCosts","rAndD","sellingExpenses","administrativeExpenses","wacc","taxRate"];

const cleanInputMap=value=>{
  const source=value instanceof Map?Object.fromEntries(value):value||{};
  const output={};
  inputKeys.forEach(key=>{if(source[key]!==undefined&&source[key]!==null&&source[key]!==""){const n=Number(source[key]);if(Number.isFinite(n))output[key]=Math.max(0,n);}});
  return output;
};

router.get("/",auth,async(req,res)=>{
  try{
    const uid=new mongoose.Types.ObjectId(owner(req));
    const range=dateRange(req.query.startDate||req.query.from,req.query.endDate||req.query.to);
    const orderMatch={createdBy:uid,status:{$ne:"Cancelled"}};
    const expenseMatch={createdBy:uid};
    if(range){orderMatch.orderDate=range;expenseMatch.date=range;}
    const [orders,expenses,products,config]=await Promise.all([
      Order.find(orderMatch).select("subOrders totalCost discountAmount taxAmount roundOffFinalRevenue finalRevenue paidAmount dueAmount").lean(),
      Expense.find(expenseMatch).select("amount taxAmount").lean(),
      Product.find({createdBy:uid}).select("_id purchasePrice").lean(),
      ReportConfiguration.findOne({createdBy:uid}).lean()
    ]);
    const inputs=cleanInputMap(config?.financialInputs);
    const getInput=key=>inputs[key]===undefined?null:num(inputs[key]);
    const productCost=new Map(products.map(item=>[String(item._id),num(item.purchasePrice)]));
    let grossSales=0,discounts=0,netSales=0,outputTax=0,billedTotal=0,paid=0,due=0,cogs=0,cogsLines=0,costLines=0;
    orders.forEach(order=>{
      grossSales+=num(order.totalCost)+num(order.discountAmount);
      discounts+=num(order.discountAmount);
      netSales+=num(order.totalCost);
      outputTax+=num(order.taxAmount);
      billedTotal+=num(order.roundOffFinalRevenue||order.finalRevenue);
      paid+=num(order.paidAmount);
      due+=num(order.dueAmount);
      (order.subOrders||[]).forEach(item=>{
        const unit=String(item.qtyUnit||"PCS").toUpperCase();
        const qty=unit==="MTR"?num(item.MTR):num(item.quantity);
        const billable=Math.max(0,qty-num(item.shortPcs));
        if(billable<=0)return;
        costLines++;
        const price=productCost.get(String(item.productId));
        if(price===undefined)return;
        cogs+=billable*price;cogsLines++;
      });
    });
    const totalExpenses=expenses.reduce((s,e)=>s+num(e.amount),0);
    const cogsReady=costLines>0&&cogsLines===costLines;
    const grossProfit=cogsReady?round2(netSales-cogs):null;
    const depreciation=getInput("depreciation");
    const amortization=getInput("amortization");
    const da=depreciation===null&&amortization===null?null:round2((depreciation||0)+(amortization||0));
    const ebit=grossProfit===null?null:round2(grossProfit-totalExpenses);
    const ebitda=ebit===null||da===null?null:round2(ebit+da);
    const interest=getInput("interestExpense");
    const pbt=ebit===null||interest===null?null:round2(ebit-interest+(getInput("otherIncome")||0)-(getInput("otherExpenses")||0));
    const incomeTax=getInput("incomeTax");
    const pat=pbt===null||incomeTax===null?null:round2(pbt-incomeTax);
    const equity=getInput("equity");
    const avgEquity=getInput("averageEquity")??equity;
    const assets=getInput("totalAssets");
    const avgAssets=getInput("averageAssets")??assets;
    const currentAssets=getInput("currentAssets");
    const currentLiabilities=getInput("currentLiabilities");
    const cash=getInput("cash");
    const receivables=getInput("accountsReceivable");
    const avgReceivables=getInput("averageReceivables")??receivables;
    const inventory=getInput("inventory");
    const avgInventory=getInput("averageInventory")??inventory;
    const payables=getInput("accountsPayable");
    const avgPayables=getInput("averagePayables")??payables;
    const debt=getInput("debt");
    const principal=getInput("principalRepayments");
    const shares=getInput("weightedAverageShares")??getInput("sharesOutstanding");
    const marketPrice=getInput("marketPricePerShare");
    const dividends=getInput("dividends");
    const capex=getInput("capitalExpenditure");
    const cfo=getInput("operatingCashFlow");
    const variableCosts=getInput("variableCosts");
    const fixedCosts=getInput("fixedOperatingCosts");
    const taxRate=getInput("taxRate");
    const taxPct=taxRate??(pbt&&incomeTax!==null?pct(incomeTax,pbt):null);
    const nopat=ebit===null||taxPct===null?null:round2(ebit*(1-taxPct/100));
    const investedCapital=equity!==null&&debt!==null?round2(equity+debt):null;
    const netDebt=debt!==null&&cash!==null?round2(debt-cash):null;
    const eps=pat!==null&&shares!==null?ratio(pat,shares):null;
    const bookValuePerShare=equity!==null&&shares!==null?ratio(equity,shares):null;
    const marketCap=marketPrice!==null&&shares!==null?round2(marketPrice*shares):null;
    const workingCapital=currentAssets!==null&&currentLiabilities!==null?round2(currentAssets-currentLiabilities):null;
    const quickAssets=currentAssets!==null?round2(currentAssets-(inventory||0)):null;
    const contribution=variableCosts!==null?round2(netSales-variableCosts):null;
    const contributionRatio=contribution===null?null:pct(contribution,netSales);
    const breakEven=fixedCosts!==null&&contributionRatio?round2(fixedCosts/(contributionRatio/100)):null;
    const periodStart=req.query.startDate||req.query.from;
    const periodEnd=req.query.endDate||req.query.to;
    const days=periodStart&&periodEnd?Math.max(1,Math.ceil((new Date(periodEnd)-new Date(periodStart))/86400000)+1):365;
    const metric=(key,label,group,value,unit,formula,requirements=[])=>({key,label,group,value:value===null?null:round2(value),unit,formula,requirements,status:value===null?"needs_setup":"ready"});
    const metrics=[
      metric("grossSales","Gross Sales","Profit & Loss",grossSales,"₹","Net sales + discounts"),
      metric("discounts","Discounts","Profit & Loss",discounts,"₹","Discounts on invoices"),
      metric("revenue","Net Sales / Revenue","Profit & Loss",netSales,"₹","Gross sales - discounts"),
      metric("outputTax","GST / Output Tax","Tax",outputTax,"₹","Tax charged on invoices"),
      metric("cogs","COGS","Profit & Loss",cogsReady?cogs:null,"₹","Cost of sold products",cogsReady?[]:["Link sold products and maintain purchase prices"]),
      metric("grossProfit","Gross Profit","Profitability",grossProfit,"₹","Revenue - COGS",["COGS coverage"]),
      metric("grossMargin","Gross Profit Margin","Profitability",grossProfit===null?null:pct(grossProfit,netSales),"%","Gross profit / revenue"),
      metric("opex","OPEX","Operating Expenses",totalExpenses,"₹","Recorded business expenses"),
      metric("sga","SG&A","Operating Expenses",getInput("sellingExpenses")!==null&&getInput("administrativeExpenses")!==null?getInput("sellingExpenses")+getInput("administrativeExpenses"):null,"₹","Selling + administrative expenses",["Selling and administrative expenses"]),
      metric("rAndD","R&D","Operating Expenses",getInput("rAndD"),"₹","Research & development expense",["R&D expense"]),
      metric("depreciation","Depreciation","Profit & Loss",depreciation,"₹","Depreciation expense",["Depreciation"]),
      metric("amortization","Amortization","Profit & Loss",amortization,"₹","Amortization expense",["Amortization"]),
      metric("da","D&A","Profit & Loss",da,"₹","Depreciation + amortization",["Depreciation / amortization"]),
      metric("ebitda","EBITDA","Profitability",ebitda,"₹","EBIT + D&A",["COGS","Depreciation / amortization"]),
      metric("ebitdaMargin","EBITDA Margin","Profitability",ebitda===null?null:pct(ebitda,netSales),"%","EBITDA / revenue"),
      metric("ebit","EBIT","Profitability",ebit,"₹","Gross profit - OPEX",["COGS"]),
      metric("ebitMargin","EBIT Margin","Profitability",ebit===null?null:pct(ebit,netSales),"%","EBIT / revenue"),
      metric("interest","Interest / Finance Cost","Finance",interest,"₹","Interest and finance cost",["Interest expense"]),
      metric("pbt","PBT","Profitability",pbt,"₹","EBIT - finance cost + other income - other expenses",["COGS","Interest expense"]),
      metric("pbtMargin","PBT Margin","Profitability",pbt===null?null:pct(pbt,netSales),"%","PBT / revenue"),
      metric("incomeTax","Income Tax","Tax",incomeTax,"₹","Income tax expense",["Income tax"]),
      metric("pat","PAT / Net Profit","Profitability",pat,"₹","PBT - income tax",["PBT","Income tax"]),
      metric("patMargin","PAT Margin","Profitability",pat===null?null:pct(pat,netSales),"%","PAT / revenue"),
      metric("eps","EPS","Per Share",eps,"₹ / share","PAT / weighted average shares",["PAT","Weighted average shares"]),
      metric("marketCap","Market Capitalization","Market",marketCap,"₹","Market price × shares",["Market price","Shares"]),
      metric("peRatio","P/E Ratio","Market",marketPrice!==null&&eps?ratio(marketPrice,eps):null,"x","Market price / EPS",["Market price","EPS"]),
      metric("bookValuePerShare","Book Value / Share","Per Share",bookValuePerShare,"₹ / share","Equity / shares",["Equity","Shares"]),
      metric("pbRatio","P/B Ratio","Market",marketPrice!==null&&bookValuePerShare?ratio(marketPrice,bookValuePerShare):null,"x","Market price / book value per share",["Market price","Equity","Shares"]),
      metric("dividendPerShare","Dividend / Share","Per Share",dividends!==null&&shares!==null?ratio(dividends,shares):null,"₹ / share","Dividends / shares",["Dividends","Shares"]),
      metric("dividendYield","Dividend Yield","Market",dividends!==null&&shares!==null&&marketPrice?pct(dividends,marketPrice*shares):null,"%","Dividends / market capitalization",["Dividends","Market price","Shares"]),
      metric("roe","ROE","Returns",pat!==null&&avgEquity!==null?pct(pat,avgEquity):null,"%","PAT / average equity",["PAT","Average equity"]),
      metric("roa","ROA","Returns",pat!==null&&avgAssets!==null?pct(pat,avgAssets):null,"%","PAT / average assets",["PAT","Average assets"]),
      metric("roce","ROCE","Returns",ebit!==null&&investedCapital?pct(ebit,investedCapital):null,"%","EBIT / capital employed",["EBIT","Equity","Debt"]),
      metric("nopat","NOPAT","Returns",nopat,"₹","EBIT × (1 - tax rate)",["EBIT","Tax rate"]),
      metric("roic","ROIC","Returns",nopat!==null&&investedCapital?pct(nopat,investedCapital):null,"%","NOPAT / invested capital",["NOPAT","Equity","Debt"]),
      metric("workingCapital","Working Capital","Liquidity",workingCapital,"₹","Current assets - current liabilities",["Current assets","Current liabilities"]),
      metric("currentRatio","Current Ratio","Liquidity",ratio(currentAssets,currentLiabilities),"x","Current assets / current liabilities",["Current assets","Current liabilities"]),
      metric("quickRatio","Quick Ratio","Liquidity",ratio(quickAssets,currentLiabilities),"x","(Current assets - inventory) / current liabilities",["Current assets","Inventory","Current liabilities"]),
      metric("debtToEquity","Debt / Equity","Leverage",ratio(debt,equity),"x","Debt / equity",["Debt","Equity"]),
      metric("debtToAssets","Debt / Assets","Leverage",ratio(debt,assets),"x","Debt / assets",["Debt","Assets"]),
      metric("netDebt","Net Debt","Leverage",netDebt,"₹","Debt - cash",["Debt","Cash"]),
      metric("netDebtToEbitda","Net Debt / EBITDA","Leverage",ratio(netDebt,ebitda),"x","Net debt / EBITDA",["Net debt","EBITDA"]),
      metric("interestCoverage","Interest Coverage","Leverage",ratio(ebit,interest),"x","EBIT / interest",["EBIT","Interest"]),
      metric("dscr","DSCR","Leverage",ebitda!==null&&interest!==null&&principal!==null?ratio(ebitda,interest+principal):null,"x","EBITDA / (interest + principal)",["EBITDA","Interest","Principal repayments"]),
      metric("assetTurnover","Asset Turnover","Efficiency",ratio(netSales,avgAssets),"x","Revenue / average assets",["Average assets"]),
      metric("inventoryTurnover","Inventory Turnover","Efficiency",ratio(cogs,avgInventory),"x","COGS / average inventory",["COGS","Average inventory"]),
      metric("receivablesTurnover","Receivables Turnover","Efficiency",ratio(netSales,avgReceivables),"x","Revenue / average receivables",["Average receivables"]),
      metric("payablesTurnover","Payables Turnover","Efficiency",ratio(cogs,avgPayables),"x","COGS / average payables",["COGS","Average payables"]),
      metric("dso","DSO","Efficiency",avgReceivables!==null?round2(avgReceivables/netSales*days):null,"days","Average receivables / revenue × days",["Average receivables"]),
      metric("dio","DIO","Efficiency",avgInventory!==null&&cogs?round2(avgInventory/cogs*days):null,"days","Average inventory / COGS × days",["Average inventory","COGS"]),
      metric("dpo","DPO","Efficiency",avgPayables!==null&&cogs?round2(avgPayables/cogs*days):null,"days","Average payables / COGS × days",["Average payables","COGS"]),
      metric("cashConversionCycle","Cash Conversion Cycle","Efficiency",avgReceivables!==null&&avgInventory!==null&&avgPayables!==null&&cogs?round2((avgReceivables/netSales+avgInventory/cogs-avgPayables/cogs)*days):null,"days","DSO + DIO - DPO",["DSO","DIO","DPO"]),
      metric("variableCosts","Variable Costs","Unit Economics",variableCosts,"₹","Variable costs",["Variable costs"]),
      metric("fixedCosts","Fixed Operating Costs","Unit Economics",fixedCosts,"₹","Fixed operating costs",["Fixed operating costs"]),
      metric("contributionMargin","Contribution Margin","Unit Economics",contribution,"₹","Revenue - variable costs",["Variable costs"]),
      metric("contributionMarginRatio","Contribution Margin Ratio","Unit Economics",contributionRatio,"%","Contribution margin / revenue",["Variable costs"]),
      metric("breakEvenSales","Break-even Sales","Unit Economics",breakEven,"₹","Fixed costs / contribution margin ratio",["Fixed costs","Variable costs"]),
      metric("marginOfSafety","Margin of Safety","Unit Economics",breakEven!==null?netSales-breakEven:null,"₹","Revenue - break-even sales",["Break-even sales"]),
      metric("marginOfSafetyPercent","Margin of Safety %","Unit Economics",breakEven!==null?pct(netSales-breakEven,netSales):null,"%","Margin of safety / revenue",["Break-even sales"]),
      metric("operatingLeverage","Operating Leverage","Unit Economics",ratio(contribution,ebit),"x","Contribution margin / EBIT",["Variable costs","EBIT"]),
      metric("capex","CAPEX","Cash Flow",capex,"₹","Capital expenditure",["CAPEX"]),
      metric("operatingCashFlow","Operating Cash Flow","Cash Flow",cfo,"₹","Operating cash flow",["Operating cash flow"]),
      metric("investingCashFlow","Investing Cash Flow","Cash Flow",getInput("investingCashFlow"),"₹","Investing cash flow",["Investing cash flow"]),
      metric("financingCashFlow","Financing Cash Flow","Cash Flow",getInput("financingCashFlow"),"₹","Financing cash flow",["Financing cash flow"]),
      metric("freeCashFlow","Free Cash Flow","Cash Flow",cfo!==null&&capex!==null?cfo-capex:null,"₹","Operating cash flow - CAPEX",["Operating cash flow","CAPEX"]),
      metric("fcfMargin","Free Cash Flow Margin","Cash Flow",cfo!==null&&capex!==null?pct(cfo-capex,netSales):null,"%","Free cash flow / revenue",["Operating cash flow","CAPEX"]),
      metric("ocfToPat","Operating Cash Flow / PAT","Cash Flow",ratio(cfo,pat),"x","Operating cash flow / PAT",["Operating cash flow","PAT"]),
      metric("taxRate","Effective Tax Rate","Tax",pbt!==null&&incomeTax!==null?pct(incomeTax,pbt):null,"%","Income tax / PBT",["Income tax","PBT"]),
      metric("dividends","Dividends","Shareholders",dividends,"₹","Dividends paid",["Dividends"]),
      metric("retainedEarnings","Retained Earnings (period)","Shareholders",pat!==null&&dividends!==null?pat-dividends:null,"₹","PAT - dividends",["PAT","Dividends"])
    ];
    res.json({period:{start:req.query.startDate||req.query.from||null,end:req.query.endDate||req.query.to||null,days},coverage:{orders:orders.length,expenseEntries:expenses.length,cogsLines,totalCostLines},inputs,metrics});
  }catch(error){res.status(500).json({message:error.message||"Unable to calculate financial metrics."});}
});

module.exports=router;