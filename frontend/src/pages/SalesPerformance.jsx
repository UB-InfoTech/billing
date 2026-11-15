import React,{useEffect,useMemo,useState} from "react";
import axios from "axios";
import {useNavigate} from "react-router-dom";
import BusinessPageHeader from "../components/BusinessPageHeader";
import "./SalesPerformance.css";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});
const PERIODS=[{key:"30d",label:"30 days"},{key:"90d",label:"90 days"},{key:"12m",label:"12 months"}];
const EMPTY={
 summary:{},
 comparison:{previous:{}},
 range:null,
 closedTrend:[],
 pipelineStages:[],
 sources:[],
 followUps:{dueCount:0,completedDueCount:0,openDueCount:0,overdueOpenCount:0,completedDuringPeriod:0,completionRate:null,customers:{},opportunities:{}}
};

const money=value=>"₹"+Number(value||0).toLocaleString("en-IN",{maximumFractionDigits:0});
const count=value=>Number(value||0).toLocaleString("en-IN");
const percent=value=>value===null||value===undefined?"—":Number(value).toFixed(1)+"%";

function dateInputValue(date){
 const year=date.getFullYear();
 const month=String(date.getMonth()+1).padStart(2,"0");
 const day=String(date.getDate()).padStart(2,"0");
 return year+"-"+month+"-"+day;
}

function buildRange(period,customStart,customEnd){
 const start=new Date();
 start.setHours(0,0,0,0);
 const end=new Date(start);
 end.setDate(end.getDate()+1);

 if(period==="30d"){start.setTime(end.getTime());start.setDate(start.getDate()-30);}
 else if(period==="12m"){start.setTime(end.getTime());start.setFullYear(start.getFullYear()-1);}
 else if(period==="90d"){start.setTime(end.getTime());start.setDate(start.getDate()-90);}
 else{
  if(!customStart||!customEnd)return {valid:false,error:"Choose both a start date and an end date."};
  const from=new Date(customStart+"T00:00:00");
  const through=new Date(customEnd+"T00:00:00");
  if(Number.isNaN(from.getTime())||Number.isNaN(through.getTime()))return {valid:false,error:"Enter valid dates."};
  if(through<from)return {valid:false,error:"The end date must be the same as or later than the start date."};
  if(through>new Date(new Date().setHours(0,0,0,0)))return {valid:false,error:"The end date cannot be in the future."};
  start.setTime(from.getTime());
  end.setTime(through.getTime());
  end.setDate(end.getDate()+1);
 }
 return {valid:true,startAt:start.toISOString(),endAt:end.toISOString()};
}

function formatDate(value,options){
 if(!value)return "";
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return "";
 return new Intl.DateTimeFormat("en-IN",options||{day:"numeric",month:"short",year:"numeric"}).format(date);
}

function formatRange(range){
 if(!range?.startAt||!range?.endAt)return "";
 const lastDay=new Date(range.endAt);
 lastDay.setDate(lastDay.getDate()-1);
 return formatDate(range.startAt,{day:"numeric",month:"short",year:"numeric"})+" – "+formatDate(lastDay,{day:"numeric",month:"short",year:"numeric"});
}

function periodKeyForWeek(date){
 const thursday=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
 const day=thursday.getUTCDay()||7;
 thursday.setUTCDate(thursday.getUTCDate()+4-day);
 const year=thursday.getUTCFullYear();
 const yearStart=new Date(Date.UTC(year,0,1));
 const week=Math.ceil((((thursday-yearStart)/86400000)+1)/7);
 return year+"-W"+String(week).padStart(2,"0");
}

function buildTrend(data){
 const range=data?.range;
 if(!range?.startAt||!range?.endAt)return [];
 const byPeriod=new Map((data.closedTrend||[]).map(item=>[item.period,item]));
 const monthly=range.trendTimeframe==="monthly";
 const cursor=new Date(range.startAt);
 const end=new Date(range.endAt);
 cursor.setUTCHours(0,0,0,0);
 if(monthly)cursor.setUTCDate(1);
 else{
  const weekday=cursor.getUTCDay()||7;
  cursor.setUTCDate(cursor.getUTCDate()-(weekday-1));
 }
 const items=[];
 let guard=0;
 while(cursor<end&&guard<60){
  const key=monthly
   ?cursor.getUTCFullYear()+"-"+String(cursor.getUTCMonth()+1).padStart(2,"0")
   :periodKeyForWeek(cursor);
  const source=byPeriod.get(key)||{};
  items.push({
   period:key,
   wonCount:Number(source.wonCount||0),
   lostCount:Number(source.lostCount||0),
   wonValue:Number(source.wonValue||0),
   label:monthly
    ?formatDate(new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth(),1)),{month:"short",year:"2-digit"})
    :formatDate(cursor,{day:"numeric",month:"short"})
  });
  if(monthly)cursor.setUTCMonth(cursor.getUTCMonth()+1);
  else cursor.setUTCDate(cursor.getUTCDate()+7);
  guard+=1;
 }
 return items;
}

function ChangeNote({value,unit}){
 if(value===null||value===undefined)return <span className="sp-change sp-change-neutral">No previous-period baseline</span>;
 const number=Number(value);
 const positive=number>0;
 const negative=number<0;
 const text=(positive?"+":"")+number.toFixed(1)+unit+" vs previous period";
 return <span className={"sp-change "+(positive?"sp-change-up":negative?"sp-change-down":"sp-change-neutral")}>{text}</span>;
}

function MetricCard({label,value,note,change,changeUnit,icon,tone}){
 return <article className="sp-metric-card">
  <div className="sp-metric-top">
   <span>{label}</span>
   <span className={"sp-metric-icon "+(tone||"")} aria-hidden="true"><i className={"bi "+icon}></i></span>
  </div>
  <strong className="sp-metric-value">{value}</strong>
  <div className="sp-metric-bottom">
   <span>{note}</span>
   {change!==undefined&&<ChangeNote value={change} unit={changeUnit||"%"}/>}
  </div>
 </article>;
}

function TrendChart({items,averageDays}){
 const maxTotal=Math.max(1,...items.map(item=>item.wonCount+item.lostCount));
 const showEvery=items.length>9?2:1;
 const totalWon=items.reduce((sum,item)=>sum+item.wonCount,0);
 const totalLost=items.reduce((sum,item)=>sum+item.lostCount,0);
 if(!items.length)return <div className="sp-empty">No closed opportunities in this period. Move opportunities to Won or Lost to build your sales trend.</div>;
 return <div className="sp-chart-area">
  <div className="sp-chart-summary">
   <div><span className="sp-dot sp-dot-won"></span><strong>{count(totalWon)}</strong><small>Won</small></div>
   <div><span className="sp-dot sp-dot-lost"></span><strong>{count(totalLost)}</strong><small>Lost</small></div>
   <div className="sp-chart-cycle"><small>Average time to win</small><strong>{averageDays===null||averageDays===undefined?"—":Number(averageDays).toFixed(1)+" days"}</strong></div>
  </div>
  <div className="sp-chart" role="img" aria-label="Won and lost opportunities over the selected period">
   <div className="sp-chart-grid" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
   <div className="sp-chart-columns">
    {items.map((item,index)=>{
     const total=item.wonCount+item.lostCount;
     const height=total?Math.max(3,(total/maxTotal)*100):0;
     return <div className="sp-chart-column" key={item.period} title={item.label+": "+item.wonCount+" won, "+item.lostCount+" lost"}>
      <div className="sp-chart-bar-wrap">
       {total>0&&<strong className="sp-chart-total">{count(total)}</strong>}
       <div className="sp-chart-bar" style={{height:height+"%"}}>
        {item.wonCount>0&&<span className="sp-chart-won" style={{flex:item.wonCount}}></span>}
        {item.lostCount>0&&<span className="sp-chart-lost" style={{flex:item.lostCount}}></span>}
       </div>
      </div>
      <span className={"sp-chart-label "+(index%showEvery===0?"":"sp-chart-label-muted")}>{item.label}</span>
     </div>;
    })}
   </div>
  </div>
 </div>;
}

function PipelineStages({stages}){
 const populated=stages.filter(stage=>Number(stage.count)>0);
 const maxValue=Math.max(1,...populated.map(stage=>Number(stage.value||0)));
 const maxCount=Math.max(1,...populated.map(stage=>Number(stage.count||0)));
 if(!populated.length)return <div className="sp-empty">Your active opportunities will appear here as you add them to the sales pipeline.</div>;
 return <div className="sp-stage-list">
  {populated.map(stage=>{
   const value=Number(stage.value||0);
   const countWidth=value>0?(value/maxValue)*100:(Number(stage.count||0)/maxCount)*100;
   return <div className="sp-stage-row" key={stage.key}>
    <div className="sp-stage-info">
     <div><strong>{stage.label}</strong><span>{count(stage.count)} {Number(stage.count)===1?"opportunity":"opportunities"}</span></div>
     <strong>{money(value)}</strong>
    </div>
    <div className="sp-stage-track"><span style={{width:Math.max(2,countWidth)+"%"}}></span></div>
    <div className="sp-stage-foot"><span>{Number(stage.probability||0)}% chance of closing</span><span>Forecast: {money(stage.weightedValue)}</span></div>
   </div>;
  })}
 </div>;
}

export default function SalesPerformance(){
 const navigate=useNavigate();
 const today=new Date();
 const initialStart=new Date(today);
 initialStart.setDate(initialStart.getDate()-89);
 const [period,setPeriod]=useState("90d");
 const [customStart,setCustomStart]=useState(dateInputValue(initialStart));
 const [customEnd,setCustomEnd]=useState(dateInputValue(today));
 const [refreshKey,setRefreshKey]=useState(0);
 const [data,setData]=useState(EMPTY);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const range=useMemo(()=>buildRange(period,customStart,customEnd),[period,customStart,customEnd]);
 const query=useMemo(()=>range.valid?new URLSearchParams({startAt:range.startAt,endAt:range.endAt}).toString():"",[range]);

 useEffect(()=>{
  if(!range.valid){setLoading(false);return undefined;}
  let active=true;
  const load=async()=>{
   setLoading(true);
   setError("");
   try{
    const response=await axios.get(API+"/api/deals/performance?"+query,auth());
    if(active)setData({...EMPTY,...(response.data||{})});
   }catch(loadError){
    if(active)setError(loadError.response?.data?.message||"Sales performance could not be loaded. Please try again.");
   }finally{
    if(active)setLoading(false);
   }
  };
  load();
  return()=>{active=false;};
 },[query,range.valid,refreshKey]);

 const summary=data.summary||{};
 const comparison=data.comparison||{};
 const followUps=data.followUps||EMPTY.followUps;
 const trend=useMemo(()=>buildTrend(data),[data]);
 const stages=data.pipelineStages||[];
 const sources=data.sources||[];
 const progressWidth=followUps.completionRate===null||followUps.completionRate===undefined?0:Math.min(100,Math.max(0,Number(followUps.completionRate)));
 const hasAnyOpportunities=Number(summary.createdCount||0)>0||Number(summary.pipelineCount||0)>0||Number(summary.closedCount||0)>0;
 const overdue=Number(followUps.overdueOpenCount||0);

 return <div className="container-fluid py-4 sales-performance-page">
  <BusinessPageHeader
   eyebrow="CRM INSIGHTS"
   title="Sales performance"
   description="See what is moving forward, what is getting won and where your team should follow up next."
   className="sp-page-heading"
  >
   <button type="button" className="btn btn-outline-secondary sp-header-button" onClick={()=>navigate("/deals")}>
    <i className="bi bi-kanban me-2" aria-hidden="true"></i>Open sales pipeline
   </button>
   <button type="button" className="btn btn-primary sp-header-button" onClick={()=>setRefreshKey(value=>value+1)} disabled={loading||!range.valid}>
    <i className={"bi bi-arrow-clockwise me-2"+(loading?" sp-spin":"")} aria-hidden="true"></i>Refresh
   </button>
  </BusinessPageHeader>

  <section className="sp-period-card" aria-label="Choose reporting period">
   <div className="sp-period-heading">
    <div>
     <strong>Reporting period</strong>
     <span>{data.range?formatRange(data.range):"Choose a period to review your results"}</span>
    </div>
    <div className="sp-period-presets" role="group" aria-label="Quick date ranges">
     {PERIODS.map(item=><button key={item.key} type="button" className={period===item.key?"is-active":""} onClick={()=>setPeriod(item.key)} aria-pressed={period===item.key}>{item.label}</button>)}
     <button type="button" className={period==="custom"?"is-active":""} onClick={()=>setPeriod("custom")} aria-pressed={period==="custom"}>Custom</button>
    </div>
   </div>
   {period==="custom"&&<div className="sp-custom-range">
    <label>From<input type="date" value={customStart} max={customEnd||dateInputValue(today)} onChange={event=>setCustomStart(event.target.value)}/></label>
    <span className="sp-date-separator" aria-hidden="true">to</span>
    <label>To<input type="date" value={customEnd} min={customStart} max={dateInputValue(today)} onChange={event=>setCustomEnd(event.target.value)}/></label>
   </div>}
  </section>

  {!range.valid&&<div className="alert alert-warning sp-alert" role="alert">{range.error}</div>}
  {error&&<div className="alert alert-danger sp-alert" role="alert"><span>{error}</span><button type="button" className="btn btn-sm btn-light border" onClick={()=>setRefreshKey(value=>value+1)}>Try again</button></div>}

  {loading?<section className="sp-loading-grid" aria-label="Loading sales performance">
   {Array.from({length:4}).map((_,index)=><div className="sp-skeleton-card" key={index}><span></span><strong></strong><small></small></div>)}
   <div className="sp-loading-message"><span className="spinner-border spinner-border-sm me-2" role="status"></span>Loading your sales results…</div>
  </section>:!error&&range.valid&&<>
   {!hasAnyOpportunities&&<section className="sp-first-use">
    <div className="sp-first-use-icon"><i className="bi bi-graph-up-arrow" aria-hidden="true"></i></div>
    <div><h2>Your sales picture starts here</h2><p>Add your first opportunity to track pipeline value, wins and follow-ups in one place.</p></div>
    <button type="button" className="btn btn-primary" onClick={()=>navigate("/deals")}>Add an opportunity <i className="bi bi-arrow-right ms-1" aria-hidden="true"></i></button>
   </section>}

   <section className="sp-metrics" aria-label="Sales summary">
    <MetricCard
     label="New opportunities"
     value={count(summary.createdCount)}
     note={money(summary.createdValue)+" in potential value added"}
     change={comparison.createdCountChange}
     icon="bi-plus-circle"
     tone="sp-icon-blue"
    />
    <MetricCard
     label="Won opportunities"
     value={count(summary.wonCount)}
     note={money(summary.wonValue)+" won in this period"}
     change={comparison.wonCountChange}
     icon="bi-trophy"
     tone="sp-icon-green"
    />
    <MetricCard
     label="Win rate"
     value={percent(summary.winRate)}
     note={count(summary.closedCount)+" opportunities closed"}
     change={comparison.winRateChangePoints}
     changeUnit=" pp"
     icon="bi-bullseye"
     tone="sp-icon-purple"
    />
    <MetricCard
     label="Active pipeline"
     value={money(summary.pipelineValue)}
     note={count(summary.pipelineCount)+" open opportunities · "+money(summary.weightedForecast)+" weighted forecast"}
     icon="bi-layers"
     tone="sp-icon-amber"
    />
   </section>

   <section className="sp-insight-strip" aria-label="Sales attention summary">
    <div className="sp-insight-primary">
     <span className="sp-insight-icon"><i className="bi bi-lightbulb" aria-hidden="true"></i></span>
     <div><strong>{money(summary.weightedForecast)} expected from your open pipeline</strong><span>Forecast based on each opportunity's current stage probability. It is not invoiced revenue.</span></div>
    </div>
    <div className={"sp-insight-action "+(overdue>0?"is-alert":"")}>
     <div><strong>{count(overdue)} overdue {overdue===1?"follow-up":"follow-ups"}</strong><span>{overdue>0?"Needs attention":"No overdue reminders right now"}</span></div>
     <button type="button" onClick={()=>navigate("/follow-ups")}>View follow-ups <i className="bi bi-arrow-right" aria-hidden="true"></i></button>
    </div>
   </section>

   <div className="sp-main-grid">
    <section className="sp-panel sp-trend-panel">
     <header className="sp-panel-heading">
      <div><h2>Wins and losses over time</h2><p>Opportunities closed during {formatRange(data.range)}. Missing periods are shown as zero.</p></div>
      <span className="sp-period-tag">{data.range?.trendTimeframe==="monthly"?"Monthly":"Weekly"} view</span>
     </header>
     <TrendChart items={trend} averageDays={summary.averageSalesCycleDays}/>
    </section>
    <section className="sp-panel sp-stage-panel">
     <header className="sp-panel-heading"><div><h2>Where opportunities stand</h2><p>Current open opportunities, grouped by sales stage</p></div></header>
     <PipelineStages stages={stages}/>
     <button type="button" className="sp-panel-link" onClick={()=>navigate("/deals")}>Manage sales pipeline <i className="bi bi-arrow-right" aria-hidden="true"></i></button>
    </section>
   </div>

   <div className="sp-bottom-grid">
    <section className="sp-panel sp-source-panel">
     <header className="sp-panel-heading"><div><h2>Where opportunities come from</h2><p>Lead sources for opportunities created in this period. Outcomes reflect their current status.</p></div></header>
     {sources.length?<div className="sp-table-wrap">
      <table className="sp-source-table">
       <thead><tr><th>Lead source</th><th>Opportunities</th><th>Won</th><th>Win rate so far</th><th>Won value</th></tr></thead>
       <tbody>{sources.map(source=><tr key={source.source}>
        <td><strong>{source.source}</strong></td>
        <td>{count(source.leadCount)}</td>
        <td>{count(source.wonCount)}</td>
        <td><span className="sp-rate-pill">{percent(source.winRate)}</span></td>
        <td className="sp-value-cell">{money(source.wonValue)}</td>
       </tr>)}</tbody>
      </table>
     </div>:<div className="sp-empty">No lead sources recorded for opportunities created in this period. Add a source when creating an opportunity to compare channels.</div>}
    </section>

    <section className="sp-panel sp-followup-panel">
     <header className="sp-panel-heading"><div><h2>Follow-up health</h2><p>Customer and opportunity tasks due in this period</p></div></header>
     <div className="sp-followup-rate">
      <div><strong>{percent(followUps.completionRate)}</strong><span>completed by due date</span></div>
      <div className="sp-progress-track"><span style={{width:progressWidth+"%"}}></span></div>
      <small>{count(followUps.completedDueCount)} of {count(followUps.dueCount)} due follow-ups completed</small>
     </div>
     <div className="sp-followup-stats">
      <div><span>Still open</span><strong>{count(followUps.openDueCount)}</strong></div>
      <div><span>Completed in period</span><strong>{count(followUps.completedDuringPeriod)}</strong></div>
      <div className={overdue>0?"is-overdue":""}><span>Overdue now</span><strong>{count(overdue)}</strong></div>
     </div>
     <div className="sp-followup-split">
      <span>Customer follow-ups <strong>{count(followUps.customers?.completedDueCount||0)}/{count(followUps.customers?.dueCount||0)}</strong></span>
      <span>Opportunity follow-ups <strong>{count(followUps.opportunities?.completedDueCount||0)}/{count(followUps.opportunities?.dueCount||0)}</strong></span>
     </div>
     <button type="button" className="sp-panel-link" onClick={()=>navigate("/follow-ups")}>Open follow-up workspace <i className="bi bi-arrow-right" aria-hidden="true"></i></button>
    </section>
   </div>
   <p className="sp-footnote">Sales pipeline values are opportunity estimates, not confirmed invoice revenue. View actual sales and collections in Reports.</p>
  </>}
 </div>;
}
