import React,{useEffect,useState} from "react";
import axios from "axios";
import {useNavigate} from "react-router-dom";
import BusinessPageHeader from "../components/BusinessPageHeader";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});
const money=value=>"₹"+Number(value||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});

const DEFAULT_WIDGETS=[
  {key:"quickActions",title:"Quick actions",visible:true,order:0},
  {key:"revenue",title:"Revenue",visible:true,order:1},
  {key:"outstanding",title:"To collect",visible:true,order:2},
  {key:"paid",title:"Paid",visible:true,order:3},
  {key:"invoices",title:"Invoices",visible:true,order:4},
  {key:"clients",title:"Customers",visible:true,order:5},
  {key:"products",title:"Products",visible:true,order:6},
  {key:"expenses",title:"Expenses",visible:true,order:7},
  {key:"creditNotes",title:"Credit Notes",visible:true,order:8},
  {key:"netAfterExpenses",title:"Net after expenses",visible:true,order:9}
];

const DASHBOARD_ACTIONS=[
  {key:"invoice",label:"New invoice",description:"Create a bill for a customer",icon:"bi-receipt",to:"/orders?action=new",primary:true},
  {key:"customer",label:"Add customer",description:"Save a customer or company",icon:"bi-person-plus",to:"/clients?action=new"},
  {key:"payment",label:"Record payment",description:"Add a customer payment",icon:"bi-cash-stack",to:"/bulk-payment"},
  {key:"expense",label:"Add expense",description:"Record business spending",icon:"bi-wallet2",to:"/add-expense"},
  {key:"product",label:"Add product",description:"Save an item and its price",icon:"bi-box-seam",to:"/products?action=new"},
  {key:"purchase",label:"Record purchase",description:"Receive stock from a supplier",icon:"bi-cart-plus",to:"/purchases?action=new"}
];

export default function Home(){
  const navigate=useNavigate();
  const [user,setUser]=useState(null);
  const [data,setData]=useState(null);
  const [widgets,setWidgets]=useState(DEFAULT_WIDGETS);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [setupGuideDismissed,setSetupGuideDismissed]=useState(false);

  const setupGuideStorageKey="billingSetupGuideDismissed:"+String(user?._id||user?.id||user?.username||"account");

  useEffect(()=>{
    try{
      setSetupGuideDismissed(localStorage.getItem(setupGuideStorageKey)==="true");
    }catch{
      setSetupGuideDismissed(false);
    }
  },[setupGuideStorageKey]);

  const dismissSetupGuide=()=>{
    setSetupGuideDismissed(true);
    try{
      localStorage.setItem(setupGuideStorageKey,"true");
    }catch{
      // The guide remains dismissed for the current session when storage is unavailable.
    }
  };

  useEffect(()=>{
    let alive=true;
    Promise.all([
      axios.get(API+"/api/auth/user",auth()),
      axios.get(API+"/api/reports/dashboard-summary",auth()),
      axios.get(API+"/api/dashboard-config",auth()).catch(()=>({data:null}))
    ]).then(([userResponse,dataResponse,configResponse])=>{
      if(!alive)return;
      setUser(userResponse.data);
      setData(dataResponse.data);
      if(Array.isArray(configResponse.data?.widgets)&&configResponse.data.widgets.length){
        setWidgets(configResponse.data.widgets.slice().sort((a,b)=>a.order-b.order));
      }
    }).catch(loadError=>{
      if(!alive)return;
      if(loadError.response?.status===401){
        localStorage.removeItem("token");
        navigate("/login");
      }else{
        setError(loadError.response?.data?.message||"Unable to load your business overview.");
      }
    }).finally(()=>alive&&setLoading(false));
    return()=>{alive=false;};
  },[navigate]);

  if(loading){
    return(
      <div className="ux-dashboard-loading" role="status" aria-live="polite">
        <span className="spinner-border spinner-border-sm text-primary" aria-hidden="true"></span>
        <span>Preparing your business overview…</span>
      </div>
    );
  }

  const widget=key=>widgets.find(item=>item.key===key)||DEFAULT_WIDGETS.find(item=>item.key===key)||{};
  const isVisible=key=>widget(key).visible!==false;
  const title=key=>widget(key).title||key;

  const metrics=[
    {key:"revenue",value:money(data?.revenue),detail:"Sales recorded",icon:"bi-graph-up-arrow",to:"/analytics",tone:"blue"},
    {key:"outstanding",value:money(data?.due),detail:"Customer balances to collect",icon:"bi-hourglass-split",to:"/orders",tone:"amber"},
    {key:"paid",value:money(data?.paid),detail:"Payments received",icon:"bi-check-circle",to:"/bulk-payment",tone:"green"},
    {key:"expenses",value:money(data?.expenses),detail:"Business spending",icon:"bi-wallet2",to:"/expense",tone:"slate"},
    {key:"invoices",value:Number(data?.orders||0).toLocaleString("en-IN"),detail:"Bills created",icon:"bi-receipt",to:"/orders",tone:"slate"},
    {key:"clients",value:Number(data?.clients||0).toLocaleString("en-IN"),detail:"Saved customers",icon:"bi-people",to:"/clients",tone:"slate"},
    {key:"products",value:Number(data?.products||0).toLocaleString("en-IN"),detail:"Saved products",icon:"bi-box-seam",to:"/products",tone:"slate"},
    {key:"creditNotes",value:money(data?.creditNotes),detail:"Credit notes issued",icon:"bi-file-earmark-minus",to:"/credit-notes",tone:"slate"},
    {key:"netAfterExpenses",value:money(Number(data?.revenue||0)-Number(data?.expenses||0)),detail:"Revenue minus expenses",icon:"bi-calculator",to:"/analytics",tone:"slate"}
  ];

  const gettingStartedTasks=[
    {key:"customers",title:"Add your first customer",description:"Save the people or companies you sell to.",done:Number(data?.clients||0)>0,to:"/clients?action=new"},
    {key:"products",title:"Add your products",description:"Save the items and prices you sell.",done:Number(data?.products||0)>0,to:"/products?action=new"},
    {key:"invoice",title:"Create your first invoice",description:"Choose a customer, add items and save the bill.",done:Number(data?.orders||0)>0,to:"/orders?action=new"}
  ];
  const completedSetupTasks=gettingStartedTasks.filter(task=>task.done).length;
  const dashboardItems=[
    ...metrics.map(metric=>({...metric,type:"metric",order:Number(widget(metric.key).order??99)})),
    {key:"quickActions",type:"actions",order:Number(widget("quickActions").order??99)}
  ].filter(item=>isVisible(item.key)).sort((a,b)=>a.order-b.order);

  return(
    <div className="container-fluid py-3 ux-dashboard">
      <BusinessPageHeader
        eyebrow="BUSINESS OVERVIEW"
        title={"Welcome back"+(user?.username?", "+user.username:"")}
        description="Your key numbers and the actions you use to run your business."
        className="ux-dashboard-header mb-4"
      >
        <span className="ux-dashboard-date">{new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</span>
      </BusinessPageHeader>

      {error&&(
        <div className="alert alert-warning d-flex align-items-center justify-content-between gap-3" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={()=>window.location.reload()}>Try again</button>
        </div>
      )}

      <section className="ux-dashboard-block mb-3" aria-labelledby="ux-dashboard-summary-title">
        <div className="ux-dashboard-block-heading">
          <div>
            <h2 id="ux-dashboard-summary-title">Business at a glance</h2>
            <p>Choose a number to open the related records or report.</p>
          </div>
          <button type="button" className="btn btn-sm btn-light border" onClick={()=>navigate("/analytics")}>View reports <i className="bi bi-arrow-right ms-1"></i></button>
        </div>
      </section>

      <div className="ux-dashboard-panels">
        {dashboardItems.map(item=>item.type==="actions"?(
          <section className="ux-dashboard-block ux-dashboard-action-panel" aria-labelledby="ux-dashboard-actions-title" key={item.key} style={{order:item.order}}>
            <div className="ux-dashboard-block-heading">
              <div>
                <h2 id="ux-dashboard-actions-title">{title(item.key)}</h2>
                <p>Start a common task directly. You can complete the details on the next screen.</p>
              </div>
            </div>
            <div className="ux-dashboard-actions">
              {DASHBOARD_ACTIONS.map(action=>(
                <button type="button" key={action.key} className={"ux-dashboard-action "+(action.primary?"is-primary":"")} onClick={()=>navigate(action.to)}>
                  <span className="ux-dashboard-action-icon"><i className={"bi "+action.icon}></i></span>
                  <span className="ux-dashboard-action-copy"><strong>{action.label}</strong><small>{action.description}</small></span>
                  <i className="bi bi-arrow-up-right ux-dashboard-action-arrow" aria-hidden="true"></i>
                </button>
              ))}
            </div>
          </section>
        ):(
          <button type="button" key={item.key} className={"ux-dashboard-metric tone-"+item.tone} style={{order:item.order}} onClick={()=>navigate(item.to)}>
            <span className="ux-dashboard-metric-top">
              <span>{title(item.key)}</span>
              <i className={"bi "+item.icon} aria-hidden="true"></i>
            </span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </button>
        ))}
      </div>

      {completedSetupTasks<gettingStartedTasks.length&&(
        setupGuideDismissed?(
          <div className="ux-dashboard-setup-dismissed">
            <div>
              <strong>Need a hand getting started?</strong>
              <p>Your setup guide is optional. You can add business details whenever you're ready.</p>
            </div>
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={()=>{setSetupGuideDismissed(false);try{localStorage.removeItem(setupGuideStorageKey);}catch{ /* Browser storage is optional. */ } }}>Show guide</button>
          </div>
        ):(
          <section className="ux-dashboard-setup" aria-labelledby="ux-dashboard-setup-title">
            <div className="ux-dashboard-setup-heading">
              <div>
                <span className="ux-dashboard-setup-kicker">OPTIONAL · DO THIS WHENEVER YOU'RE READY</span>
                <h2 id="ux-dashboard-setup-title">A few helpful first steps</h2>
                <p>You can start billing now. Company details are optional and can be added later.</p>
              </div>
              <div className="ux-dashboard-setup-progress">
                <strong>{completedSetupTasks} of {gettingStartedTasks.length}</strong>
                <small>completed</small>
              </div>
            </div>
            <div className="ux-dashboard-setup-track" role="progressbar" aria-valuenow={completedSetupTasks} aria-valuemin={0} aria-valuemax={gettingStartedTasks.length}>
              <span style={{width:(completedSetupTasks/gettingStartedTasks.length*100)+"%"}}/>
            </div>
            <div className="ux-dashboard-setup-list">
              {gettingStartedTasks.map((task,index)=>(
                <div className={"ux-dashboard-setup-task "+(task.done?"is-complete":"")} key={task.key}>
                  <span className="ux-dashboard-setup-step">{task.done?<i className="bi bi-check-lg"></i>:index+1}</span>
                  <div><strong>{task.title}</strong><small>{task.description}</small></div>
                  {task.done
                    ?<span className="ux-dashboard-setup-done">Done</span>
                    :<button type="button" className="btn btn-sm btn-outline-primary" onClick={()=>navigate(task.to)}>Start <i className="bi bi-arrow-right ms-1"></i></button>}
                </div>
              ))}
            </div>
            <div className="ux-dashboard-setup-footer">
              <button type="button" className="btn btn-sm btn-link text-decoration-none" onClick={()=>navigate("/profile")}>Add company details <i className="bi bi-arrow-right ms-1"></i></button>
              <button type="button" className="btn btn-sm btn-light border" onClick={dismissSetupGuide}>Hide guide</button>
            </div>
          </section>
        )
      )}
    </div>
  );
}
