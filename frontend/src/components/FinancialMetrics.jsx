import React,{useEffect,useMemo,useState} from "react";
import axios from "axios";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});

const BASIC_KEYS=[
  "revenue","cogs","grossProfit","grossMargin","opex","ebitda","ebit","pbt","pat",
  "eps","roe","roa","currentRatio","debtToEquity","capex","freeCashFlow"
];

const METRIC_HELP={
  revenue:["Money earned from your bills after invoice discounts. It is the main sales figure used to judge business size.","Net Sales = Gross Sales − Discounts"],
  cogs:["The direct cost of the products you sold. It helps you understand how much of the sales amount was used to buy or make those products.","COGS = Quantity sold × Product purchase cost"],
  grossProfit:["What remains after paying the direct product cost. A higher amount usually means the business is keeping more from each sale before operating expenses.","Gross Profit = Revenue − COGS"],
  grossMargin:["Gross profit shown as a percentage of revenue. It tells you how much of every ₹100 of sales remains after direct product cost.","Gross Margin = Gross Profit ÷ Revenue × 100"],
  opex:["Regular business running costs such as rent, utilities, salaries and other recorded expenses.","OPEX = Recorded business expenses"],
  ebitda:["Operating profit before interest, tax, depreciation and amortization. It is often used to compare operating performance.","EBITDA = EBIT + Depreciation + Amortization"],
  ebit:["Operating profit before interest and tax. It focuses on the business operation itself.","EBIT = Gross Profit − OPEX"],
  pbt:["Profit before income tax. It includes finance cost and other income or expenses.","PBT = EBIT − Interest + Other Income − Other Expenses"],
  pat:["Profit left after income tax. This is the final profit for the period before owner/shareholder distributions.","PAT = PBT − Income Tax"],
  eps:["Profit earned for each share. It is mainly useful when the business has shares or investors.","EPS = PAT ÷ Weighted Average Shares"],
  roe:["How much profit the business generated compared with the owners' average equity.","ROE = PAT ÷ Average Equity × 100"],
  roa:["How efficiently the business generated profit from its average assets.","ROA = PAT ÷ Average Assets × 100"],
  currentRatio:["Shows whether current assets are enough to cover current liabilities. Higher is generally more comfortable, depending on the business.","Current Ratio = Current Assets ÷ Current Liabilities"],
  debtToEquity:["Shows how much debt the business carries compared with owners' equity.","Debt / Equity = Debt ÷ Equity"],
  capex:["Money spent on long-term assets such as machinery, equipment or other business assets.","CAPEX = Capital expenditure entered in Reports settings"],
  freeCashFlow:["Cash left after operating cash flow and capital spending. It shows cash available for growth, debt reduction or distributions.","Free Cash Flow = Operating Cash Flow − CAPEX"],
  peRatio:["Compares the market price of a share with earnings per share. It is mainly useful for publicly valued businesses.","P/E = Market Price per Share ÷ EPS"]
};

const GROUP_HELP={
  "Profit & Loss":"Sales and profit numbers from your bills and expenses.",
  "Profitability":"How much profit the business is making from its sales.",
  "Operating Expenses":"The costs of running the business.",
  "Tax":"GST and income-tax related figures.",
  "Finance":"Interest and financing costs.",
  "Per Share":"Profit and value shown per share.",
  "Market":"Investor valuation measures; these need share/market information.",
  "Returns":"How effectively the business uses owners' money and assets.",
  "Liquidity":"The business's ability to meet short-term obligations.",
  "Leverage":"Debt and repayment risk compared with business earnings or capital.",
  "Efficiency":"How quickly the business turns stock, sales and working capital into activity.",
  "Unit Economics":"The economics of each sale and the sales level needed to cover fixed costs.",
  "Cash Flow":"Cash generated, spent and left after investment.",
  "Shareholders":"Profit retained or distributed to owners."
};

const formatValue=(metric)=>{
  if(metric.value===null||metric.value===undefined)return "Needs setup";
  const value=Number(metric.value);
  if(metric.unit==="%")return value.toFixed(2)+"%";
  if(metric.unit==="x")return value.toFixed(2)+"x";
  if(metric.unit==="days")return value.toFixed(1)+" days";
  if(metric.unit==="₹")return "₹"+value.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
  if(metric.unit==="₹ / share")return "₹"+value.toFixed(2);
  return String(metric.value);
};

export default function FinancialMetrics({startDate,endDate,title="Financial metrics"}){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [view,setView]=useState("key");
  const [search,setSearch]=useState("");
  const [openInfo,setOpenInfo]=useState(null);

  const query=useMemo(()=>{
    const params=new URLSearchParams();
    if(startDate instanceof Date&&!Number.isNaN(startDate.getTime()))params.set("startDate",startDate.toISOString().slice(0,10));
    if(endDate instanceof Date&&!Number.isNaN(endDate.getTime()))params.set("endDate",endDate.toISOString().slice(0,10));
    return params.toString();
  },[startDate,endDate]);

  useEffect(()=>{
    let alive=true;
    const load=async()=>{
      try{
        setLoading(true);
        setError("");
        const response=await axios.get(API+"/api/financial-metrics"+(query?"?"+query:""),auth());
        if(alive)setData(response.data||null);
      }catch(loadError){
        if(alive)setError(loadError.response?.data?.message||"Unable to load financial metrics.");
      }finally{
        if(alive)setLoading(false);
      }
    };
    load();
    return()=>{alive=false;};
  },[query]);

  const visibleGroups=useMemo(()=>{
    const q=search.trim().toLowerCase();
    const map=new Map();
    (data?.metrics||[]).forEach(metric=>{
      const basic=view==="key"&&BASIC_KEYS.includes(metric.key);
      const matches=!q||[metric.label,metric.group].some(value=>String(value||"").toLowerCase().includes(q));
      if(view==="key"&&!basic)return;
      if(!matches)return;
      if(!map.has(metric.group))map.set(metric.group,[]);
      map.get(metric.group).push(metric);
    });
    return Array.from(map.entries());
  },[data,view,search]);

  const readyBasic=(data?.metrics||[]).filter(metric=>BASIC_KEYS.includes(metric.key)&&metric.status==="ready").length;
  const basicCount=BASIC_KEYS.length;

  return (
    <div className="financial-metrics-card card border-0 shadow-sm mb-3">
      <div className="card-header bg-white border-0 p-3 p-lg-4">
        <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-start gap-3">
          <div>
            <div className="d-flex align-items-center gap-2 mb-1">
              <h4 className="mb-0">{title}</h4>
              <span className="financial-metrics-help-badge"><i className="bi bi-info-circle"></i> Easy guide</span>
            </div>
            <div className="small text-secondary">Important business numbers, explained in simple language. Nothing technical is required to read this page.</div>
          </div>
          {data?.coverage&&(
            <div className="financial-metrics-coverage">
              <strong>{readyBasic}/{basicCount}</strong>
              <span>key metrics ready</span>
            </div>
          )}
        </div>

        <div className="financial-metrics-toolbar mt-3">
          <div className="btn-group financial-metrics-view" role="group" aria-label="Metric view">
            <button type="button" className={view==="key"?"btn btn-primary":"btn btn-light border"} onClick={()=>setView("key")}>Important</button>
            <button type="button" className={view==="all"?"btn btn-primary":"btn btn-light border"} onClick={()=>setView("all")}>All metrics</button>
          </div>
          <div className="input-group financial-metrics-search">
            <span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
            <input className="form-control" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Find a metric, like EBITDA or ROE"/>
          </div>
        </div>

        <div className="financial-metrics-legend mt-3">
          <span><i className="bi bi-check-circle-fill text-success"></i> Ready = calculated from available information</span>
          <span><i className="bi bi-circle text-secondary"></i> Needs setup = one or more business figures are missing</span>
        </div>
      </div>

      <div className="card-body pt-0">
        {error&&<div className="alert alert-danger">{error}</div>}
        {loading
          ? <div className="text-center py-5"><span className="spinner-border spinner-border-sm me-2"></span>Loading financial metrics...</div>
          : !visibleGroups.length
            ? <div className="financial-metrics-empty text-center text-secondary py-5">
                <i className="bi bi-search fs-3 d-block mb-2"></i>
                No metrics match your search.
              </div>
            : visibleGroups.map(([group,metrics])=>(
                <section className="financial-metrics-group" key={group}>
                  <div className="financial-metrics-group-heading">
                    <div>
                      <h5 className="mb-1">{group}</h5>
                      <p>{GROUP_HELP[group]||"Related business measures."}</p>
                    </div>
                    {view==="all"&&<span className="badge bg-light text-dark border">{metrics.length} metrics</span>}
                  </div>
                  <div className="row g-3">
                    {metrics.map(metric=>{
                      const help=METRIC_HELP[metric.key];
                      const infoOpen=openInfo===metric.key;
                      return (
                        <div className="col-12 col-md-6 col-xl-3" key={metric.key}>
                          <div className={"financial-metric-card h-100 "+(metric.status!=="ready"?"is-needs-setup":"")}>
                            <div className="d-flex justify-content-between align-items-start gap-2">
                              <div className="fw-semibold">{metric.label}</div>
                              <div className="d-flex align-items-center gap-1">
                                <button
                                  type="button"
                                  className="financial-metric-info"
                                  aria-label={"Learn about "+metric.label}
                                  title={"Learn about "+metric.label}
                                  onClick={()=>setOpenInfo(infoOpen?null:metric.key)}
                                >
                                  <i className="bi bi-info-circle"></i>
                                </button>
                                <span className={"badge "+(metric.status==="ready"?"text-bg-success":"text-bg-light border text-secondary")}>
                                  {metric.status==="ready"?"Ready":"Setup"}
                                </span>
                              </div>
                            </div>
                            <div className="financial-metric-value">{formatValue(metric)}</div>
                            <div className="small text-secondary">{metric.formula}</div>

                            {infoOpen&&(
                              <div className="financial-metric-info-panel">
                                <div className="fw-semibold mb-1">What it means</div>
                                <div className="small text-secondary mb-2">{help?.[0]||"This metric helps you understand one part of business performance."}</div>
                                <div className="fw-semibold mb-1">How it is calculated</div>
                                <div className="small">{help?.[1]||metric.formula||"Calculated from the business figures available for this period."}</div>
                              </div>
                            )}

                            {metric.status!=="ready"&&metric.requirements?.length>0&&(
                              <div className="financial-metric-setup mt-2">
                                <strong>What is missing:</strong> {metric.requirements.join(", ")}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))
        }

        {!loading&&data?.coverage&&(
          <div className="financial-metrics-footer mt-2">
            <i className="bi bi-lightbulb me-2"></i>
            Some investor and accounting measures need extra numbers that your billing data cannot know on its own. You can add those only when you need them in <strong>Settings → Reports → Advanced financial data</strong>.
          </div>
        )}
      </div>
    </div>
  );
}
