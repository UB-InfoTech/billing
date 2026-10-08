import React,{useEffect,useMemo,useState} from "react";
import axios from "axios";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});

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

  const groups=useMemo(()=>{
    const map=new Map();
    (data?.metrics||[]).forEach(metric=>{
      if(!map.has(metric.group))map.set(metric.group,[]);
      map.get(metric.group).push(metric);
    });
    return Array.from(map.entries());
  },[data]);

  return (
    <div className="card border-0 shadow-sm mb-3">
      <div className="card-header bg-white d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <h4 className="mb-1">{title}</h4>
          <div className="small text-secondary">Profitability, liquidity, leverage, efficiency, cash flow and investor metrics.</div>
        </div>
        {data?.coverage&&<div className="small text-secondary">{data.coverage.orders} invoices · {data.coverage.expenseEntries} expenses</div>}
      </div>
      <div className="card-body">
        {error&&<div className="alert alert-danger">{error}</div>}
        {loading
          ? <div className="text-center py-5"><span className="spinner-border spinner-border-sm me-2"></span>Loading financial metrics...</div>
          : !groups.length
            ? <div className="text-center text-secondary py-4">No financial data is available for this period.</div>
            : groups.map(([group,metrics])=>(
                <div className="mb-4" key={group}>
                  <h5 className="mb-3">{group}</h5>
                  <div className="row g-3">
                    {metrics.map(metric=>(
                      <div className="col-12 col-md-6 col-xl-3" key={metric.key}>
                        <div className="border rounded-3 h-100 p-3 bg-white">
                          <div className="d-flex justify-content-between align-items-start gap-2">
                            <div className="fw-semibold">{metric.label}</div>
                            <span className={`badge ${metric.status==="ready"?"text-bg-success":"text-bg-light border text-secondary"}`}>
                              {metric.status==="ready"?"Ready":"Needs setup"}
                            </span>
                          </div>
                          <div className="fs-5 fw-bold mt-2">{formatValue(metric)}</div>
                          <div className="small text-secondary mt-1">{metric.formula}</div>
                          {metric.status!=="ready"&&metric.requirements?.length>0&&(
                            <div className="small text-warning-emphasis mt-2">
                              <strong>Needs:</strong> {metric.requirements.join(", ")}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
        }
      </div>
    </div>
  );
}
