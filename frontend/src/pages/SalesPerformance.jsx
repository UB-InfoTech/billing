import React,{useEffect,useMemo,useState} from "react";
import axios from "axios";
import {useNavigate} from "react-router-dom";
import BusinessPageHeader from "../components/BusinessPageHeader";
import "./SalesPerformance.css";
const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});
const PERIODS=[{key:"30d",label:"30 days"},{key:"90d",label:"90 days"},{key:"12m",label:"12 months"}];
const money=value=>"₹"+Number(value||0).toLocaleString("en-IN",{maximumFractionDigits:0});
const count=value=>Number(value||0).toLocaleString("en-IN");
const percent=value=>value===null||value===undefined?"—":Number(value).toFixed(1)+"%";
const EMPTY={summary:{},closedTrend:[],pipelineStages:[],sources:[],followUps:{dueCount:0,completedDueCount:0,openDueCount:0,overdueOpenCount:0,completedDuringPeriod:0,completionRate:null,customers:{},opportunities:{}}};
function getRangeQuery(period){
 const end=new Date();end.setHours(0,0,0,0);end.setDate(end.getDate()+1);
 const start=new Date(end);
 if(period==="30d")start.setDate(start.getDate()-30);
 else if(period==="12m")start.setMonth(start.getMonth()-12);
 else start.setDate(start.getDate()-90);
 return new URLSearchParams({startAt:start.toISOString(),endAt:end.toISOString()}).toString();
}
function periodLabel(value,timeframe){
 if(timeframe==="monthly"){
  const date=new Date(value+"-01T00:00:00");
  return Number.isNaN(date.getTime())?value:date.toLocaleDateString("en-IN",{month:"short",year:"2-digit"});
 }
 const week=value.split("-W")[1];
 return week?"Week "+Number(week):value;
}
function MetricCard({label,value,note,icon}){
 return <article className="sales-performance-metric"><div className="sales-performance-metric-top"><span>{label}</span><i className={"bi "+icon} aria-hidden="true"></i></div><strong>{value}</strong><small>{note}</small></article>;
}
export default function SalesPerformance(){
 const navigate=useNavigate();
 const [period,setPeriod]=useState("90d");
 const [refreshKey,setRefreshKey]=useState(0);
 const [data,setData]=useState(EMPTY);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const query=useMemo(()=>getRangeQuery(period),[period]);
 useEffect(()=>{
  let active=true;
  const load=async()=>{
   setLoading(true);setError("");
   try{const response=await axios.get(API+"/api/deals/performance?"+query,auth());if(active)setData({...EMPTY,...(response.data||{})});}
   catch(loadError){if(active)setError(loadError.response?.data?.message||"Sales performance could not be loaded. Please try again.");}
   finally{if(active)setLoading(false);}
  };
  load();return()=>{active=false;};
 },[query,refreshKey]);
 const summary=data.summary||{},followUps=data.followUps||EMPTY.followUps,trend=data.closedTrend||[],stages=data.pipelineStages||[],sources=data.sources||[];
 const maxClosed=Math.max(1,...trend.map(item=>Number(item.wonCount||0)+Number(item.lostCount||0)));
 const maxStageCount=Math.max(1,...stages.map(item=>Number(item.count||0)));
 const completionRate=followUps.completionRate,dueTotal=Number(followUps.dueCount||0),completedDue=Number(followUps.completedDueCount||0),openDue=Number(followUps.openDueCount||0);
 const progressWidth=completionRate===null||completionRate===undefined?0:Math.min(100,Math.max(0,Number(completionRate)));
 return <div className="container-fluid py-4 sales-performance-page">
  <BusinessPageHeader eyebrow="CRM OVERVIEW" title="Sales performance" description="Understand what your team is winning, where opportunities stand and how consistently follow-ups are completed. Opportunity values come from the CRM pipeline; invoice revenue remains in Reports." className="mb-3">
   <button type="button" className="btn btn-light border" onClick={()=>navigate("/deals")}><i className="bi bi-kanban me-2"></i>Sales pipeline</button>
   <button type="button" className="btn btn-primary" onClick={()=>setRefreshKey(value=>value+1)} disabled={loading}><i className={"bi bi-arrow-clockwise me-2"+(loading?" sales-performance-spin":"")}></i>Refresh</button>
  </BusinessPageHeader>
  <section className="sales-performance-toolbar" aria-label="Performance date range">
   <div><strong>Performance period</strong><span>Choose which sales activity to review</span></div>
   <div className="sales-performance-periods" role="group" aria-label="Choose date range">
    {PERIODS.map(item=><button key={item.key} type="button" className={period===item.key?"is-active":""} onClick={()=>setPeriod(item.key)} aria-pressed={period===item.key}>{item.label}</button>)}
   </div>
  </section>
  {error&&<div className="alert alert-warning d-flex justify-content-between align-items-center gap-2" role="alert"><span>{error}</span><button type="button" className="btn btn-sm btn-light border" onClick={()=>setRefreshKey(value=>value+1)}>Try again</button></div>}
  {loading?<div className="sales-performance-loading"><span className="spinner-border spinner-border-sm me-2"></span>Loading sales performance...</div>:<>
   <section className="sales-performance-metrics" aria-label="Sales results">
    <MetricCard label="Opportunities added" value={count(summary.createdCount)} note="Created during this period" icon="bi-plus-circle"/>
    <MetricCard label="Won" value={count(summary.wonCount)} note={"Won opportunity value: "+money(summary.wonValue)} icon="bi-trophy"/>
    <MetricCard label="Lost" value={count(summary.lostCount)} note={"Lost opportunity value: "+money(summary.lostValue)} icon="bi-flag"/>
    <MetricCard label="Win rate" value={percent(summary.winRate)} note={count(summary.closedCount)+" opportunities closed in this period"} icon="bi-bullseye"/>
   </section>
   <section className="sales-performance-forecast" aria-label="Current pipeline forecast">
    <div className="sales-performance-forecast-item"><span>Open pipeline</span><strong>{money(summary.pipelineValue)}</strong><small>{count(summary.pipelineCount)} active opportunities</small></div>
    <div className="sales-performance-forecast-item"><span>Weighted forecast</span><strong>{money(summary.weightedForecast)}</strong><small>Current opportunity values adjusted by stage probability</small></div>
    <div className="sales-performance-forecast-item"><span>Average time to win</span><strong>{summary.averageSalesCycleDays===null||summary.averageSalesCycleDays===undefined?"—":Number(summary.averageSalesCycleDays).toFixed(1)+" days"}</strong><small>For opportunities won during this period</small></div>
   </section>
   <div className="sales-performance-main-grid">
    <section className="sales-performance-panel sales-performance-trend">
     <header className="sales-performance-panel-heading"><div><h2>Closed opportunities</h2><p>Won and lost opportunities by {data.range?.trendTimeframe==="monthly"?"month":"week"}</p></div><span className="sales-performance-legend"><i className="is-won"></i>Won <i className="is-lost"></i>Lost</span></header>
     {trend.length?<div className="sales-performance-chart" role="img" aria-label="Won and lost opportunities by period">
      {trend.map(item=>{const won=Number(item.wonCount||0),lost=Number(item.lostCount||0);return <div className="sales-performance-chart-column" key={item.period} title={periodLabel(item.period,data.range?.trendTimeframe)+": "+won+" won, "+lost+" lost"}>
       <div className="sales-performance-chart-track"><span className="sales-performance-bar-won" style={{height:((won/maxClosed)*100)+"%"}}></span><span className="sales-performance-bar-lost" style={{height:((lost/maxClosed)*100)+"%"}}></span></div><strong>{won+lost}</strong><small>{periodLabel(item.period,data.range?.trendTimeframe)}</small>
      </div>;})}
     </div>:<div className="sales-performance-empty">No opportunities were closed in this period.</div>}
    </section>
    <section className="sales-performance-panel">
     <header className="sales-performance-panel-heading"><div><h2>Open pipeline by stage</h2><p>Where current opportunities stand</p></div></header>
     {stages.some(item=>Number(item.count)>0)?<div className="sales-performance-stage-list">{stages.map(stage=><div className="sales-performance-stage" key={stage.key}>
      <div className="sales-performance-stage-top"><strong>{stage.label}</strong><span>{count(stage.count)} · {money(stage.value)}</span></div>
      <div className="sales-performance-stage-track"><span style={{width:((Number(stage.count||0)/maxStageCount)*100)+"%"}}></span></div><small>{Number(stage.probability||0)}% forecast probability</small>
     </div>)}</div>:<div className="sales-performance-empty">New opportunities will appear here as your pipeline fills.</div>}
    </section>
   </div>
   <div className="sales-performance-bottom-grid">
    <section className="sales-performance-panel">
     <header className="sales-performance-panel-heading"><div><h2>Lead source results</h2><p>Which channels are bringing opportunities</p></div></header>
     {sources.length?<div className="sales-performance-table-wrap"><table className="sales-performance-source-table">
      <thead><tr><th>Source</th><th>Leads</th><th>Won</th><th>Win rate</th><th>Won value</th></tr></thead>
      <tbody>{sources.map(source=><tr key={source.source}><td>{source.source}</td><td>{count(source.leadCount)}</td><td>{count(source.wonCount)}</td><td>{percent(source.winRate)}</td><td>{money(source.wonValue)}</td></tr>)}</tbody>
     </table></div>:<div className="sales-performance-empty">Add a lead source to opportunities to compare channels here.</div>}
    </section>
    <section className="sales-performance-panel sales-performance-followups">
     <header className="sales-performance-panel-heading"><div><h2>Follow-up effectiveness</h2><p>Customer and opportunity reminders due during this period</p></div></header>
     <div className="sales-performance-completion"><div><strong>{percent(completionRate)}</strong><span>completion rate</span></div>
      <div className="sales-performance-completion-track"><span style={{width:progressWidth+"%"}}></span></div>
      <small>{count(completedDue)} of {count(dueTotal)} reminders due in this period are completed</small>
     </div>
     <div className="sales-performance-followup-stats">
      <div><span>Still open when due</span><strong>{count(openDue)}</strong></div>
      <div><span>Completed this period</span><strong>{count(followUps.completedDuringPeriod)}</strong></div>
      <div className={Number(followUps.overdueOpenCount)>0?"is-warning":""}><span>Overdue now</span><strong>{count(followUps.overdueOpenCount)}</strong></div>
     </div>
     <div className="sales-performance-followup-split"><span>Customers <strong>{count(followUps.customers?.completedDueCount||0)}/{count(followUps.customers?.dueCount||0)}</strong></span><span>Opportunities <strong>{count(followUps.opportunities?.completedDueCount||0)}/{count(followUps.opportunities?.dueCount||0)}</strong></span></div>
     <button type="button" className="btn btn-sm btn-light border sales-performance-followup-link" onClick={()=>navigate("/follow-ups")}>Review follow-ups <i className="bi bi-arrow-right ms-1"></i></button>
    </section>
   </div>
  </>}
 </div>;
}
