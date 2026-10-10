import React,{useEffect,useState} from "react";
import axios from "axios";
import {useNavigate} from "react-router-dom";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});
const money=v=>"₹"+Number(v||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});

const DEFAULT_WIDGETS=[
  {key:"invoices",title:"Invoices",visible:true,order:0},
  {key:"clients",title:"Customers",visible:true,order:1},
  {key:"products",title:"Products",visible:true,order:2},
  {key:"revenue",title:"Revenue",visible:true,order:3},
  {key:"outstanding",title:"To collect",visible:true,order:4},
  {key:"expenses",title:"Expenses",visible:true,order:5},
  {key:"paid",title:"Paid",visible:true,order:6},
  {key:"creditNotes",title:"Credit Notes",visible:true,order:7},
  {key:"netAfterExpenses",title:"Net after Expenses",visible:true,order:8},
  {key:"quickActions",title:"Quick actions",visible:true,order:9}
];

export default function Home(){
  const navigate=useNavigate();
  const [user,setUser]=useState(null);
  const [data,setData]=useState(null);
  const [widgets,setWidgets]=useState(DEFAULT_WIDGETS);
  const [profile,setProfile]=useState(null);
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
      // The guide can still be dismissed for this session if browser storage is unavailable.
    }
  };

  useEffect(()=>{
    let alive=true;
    Promise.all([
      axios.get(API+"/api/auth/user",auth()),
      axios.get(API+"/api/reports/dashboard-summary",auth()),
      axios.get(API+"/api/dashboard-config",auth()).catch(()=>({data:null})),
      axios.get(API+"/api/profile",auth()).catch(()=>({data:null}))
    ]).then(([userResponse,dataResponse,configResponse,profileResponse])=>{
      if(!alive)return;
      setUser(userResponse.data);
      setData(dataResponse.data);
      setProfile(profileResponse.data||null);
      if(Array.isArray(configResponse.data?.widgets)&&configResponse.data.widgets.length){
        setWidgets(configResponse.data.widgets.slice().sort((a,b)=>a.order-b.order));
      }
    }).catch(loadError=>{
      if(!alive)return;
      if(loadError.response?.status===401){
        localStorage.removeItem("token");
        navigate("/login");
      }else{
        setError(loadError.response?.data?.message||"Unable to load dashboard.");
      }
    }).finally(()=>alive&&setLoading(false));
    return()=>{alive=false;};
  },[navigate]);

  if(loading)return <div className="container-fluid py-5 text-center"><span className="spinner-border text-primary"/></div>;

  const widget=key=>widgets.find(item=>item.key===key)||DEFAULT_WIDGETS.find(item=>item.key===key)||{};
  const isVisible=key=>widget(key).visible!==false;
  const title=key=>widget(key).title||key;
  const style=key=>({order:Number(widget(key).order??99)});

  const metricCards=[
    ["invoices","/orders",data?.orders||0],
    ["clients","/clients",data?.clients||0],
    ["products","/products",data?.products||0],
    ["revenue","/analytics",money(data?.revenue)],
    ["outstanding","/orders",money(data?.due)],
    ["expenses","/expense",money(data?.expenses)]
  ];

  const gettingStartedTasks=[
    {key:"company",title:"Add your company details",description:"Your company name and address appear on printed invoices.",done:Boolean(profile?.companyName&&profile?.companyAddress),to:"/profile"},
    {key:"customers",title:"Add your first customer",description:"Save the people or companies you sell to.",done:Number(data?.clients||0)>0,to:"/clients?action=new"},
    {key:"products",title:"Add your products",description:"Save the items and prices you sell.",done:Number(data?.products||0)>0,to:"/products?action=new"},
    {key:"invoice",title:"Create your first invoice",description:"Choose a customer, add items and save the bill.",done:Number(data?.orders||0)>0,to:"/orders?action=new"}
  ];
  const completedSetupTasks=gettingStartedTasks.filter(task=>task.done).length;

  return <div className="container-fluid py-4">
    <div className="dashboard-welcome mb-4">
      <div>
        <span className="dashboard-eyebrow">YOUR BUSINESS TODAY</span>
        <h2 className="mb-1">Welcome back{user?.username?", "+user.username:""}.</h2>
        <div className="text-muted">Start with a task or check your most important numbers.</div>
      </div>
      <div className="dashboard-primary-actions">
        <button className="btn btn-primary" onClick={()=>navigate("/orders?action=new")}><i className="bi bi-plus-lg me-2"></i>New invoice</button>
        <button className="btn btn-light border" onClick={()=>navigate("/add-expense")}><i className="bi bi-wallet2 me-2"></i>Add expense</button>
        <button className="btn btn-light border" onClick={()=>navigate("/clients")}><i className="bi bi-person-plus me-2"></i>Customers</button>
        <button className="btn btn-light border" onClick={()=>navigate("/analytics")}><i className="bi bi-bar-chart me-2"></i>Reports</button>
      </div>
    </div>

    {error&&<div className="alert alert-danger">{error}</div>}

    {completedSetupTasks<gettingStartedTasks.length&&(
      setupGuideDismissed?(
        <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap mb-4 p-3 bg-white border rounded-3">
          <div>
            <strong>Want help getting started?</strong>
            <div className="small text-muted">Your setup guide is optional. You can add business details whenever you're ready.</div>
          </div>
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={()=>{setSetupGuideDismissed(false);try{localStorage.removeItem(setupGuideStorageKey);}catch{}}}>Show setup guide</button>
        </div>
      ):(
      <section className="getting-started-card mb-4" aria-labelledby="getting-started-title">
        <div className="getting-started-heading">
          <div>
            <span className="dashboard-eyebrow">OPTIONAL · START WHEN YOU'RE READY</span>
            <h3 id="getting-started-title">Get comfortable, one step at a time</h3>
            <p>You can start billing now and add company details or products later. Nothing here is compulsory.</p>
          </div>
          <div className="d-flex align-items-center gap-3">
            <div className="getting-started-progress">
              <strong>{completedSetupTasks} of {gettingStartedTasks.length}</strong>
              <span>steps complete</span>
            </div>
            <button type="button" className="btn btn-sm btn-light border" onClick={dismissSetupGuide}>Skip for now</button>
          </div>
        </div>
        <div className="getting-started-progress-track" role="progressbar" aria-valuenow={completedSetupTasks} aria-valuemin={0} aria-valuemax={gettingStartedTasks.length}>
          <span style={{width:(completedSetupTasks/gettingStartedTasks.length*100)+"%"}}/>
        </div>
        <div className="getting-started-steps">
          {gettingStartedTasks.map((task,index)=>(
            <div className={"getting-started-step "+(task.done?"is-complete":"")} key={task.key}>
              <span className="getting-started-step-number">{task.done?<i className="bi bi-check-lg"></i>:index+1}</span>
              <div className="getting-started-step-copy">
                <strong>{task.title}</strong>
                <span>{task.description}</span>
              </div>
              {task.done
                ? <span className="getting-started-done">Done</span>
                : <button type="button" className="btn btn-sm btn-outline-primary" onClick={()=>navigate(task.to)}>{task.key==="invoice"?"Create invoice":task.key==="company"?"Set up company":"Get started"} <i className="bi bi-arrow-right ms-1"></i></button>}
            </div>
          ))}
        </div>
      </section>
      )
    )}

    <div className="row g-3">
      {metricCards.map(([key,to,value])=>isVisible(key)?(
        <div className="col-6 col-md-4 col-xl-2" key={key} style={style(key)}>
          <button className="card border-0 shadow-sm w-100 h-100 text-start bg-white" onClick={()=>navigate(to)}>
            <div className="card-body">
              <div className="text-muted small">{title(key)}</div>
              <div className="fs-4 fw-bold mt-1">{value}</div>
            </div>
          </button>
        </div>
      ):null)}

      {isVisible("paid")&&(
        <div className="col-md-4" style={style("paid")}>
          <div className="card border-0 shadow-sm h-100"><div className="card-body">
            <div className="small text-muted">{title("paid")}</div>
            <div className="fs-5 fw-bold mt-1">{money(data?.paid)}</div>
          </div></div>
        </div>
      )}

      {isVisible("creditNotes")&&(
        <div className="col-md-4" style={style("creditNotes")}>
          <div className="card border-0 shadow-sm h-100"><div className="card-body">
            <div className="small text-muted">{title("creditNotes")}</div>
            <div className="fs-5 fw-bold mt-1">{money(data?.creditNotes)}</div>
          </div></div>
        </div>
      )}

      {isVisible("netAfterExpenses")&&(
        <div className="col-md-4" style={style("netAfterExpenses")}>
          <div className="card border-0 shadow-sm h-100"><div className="card-body">
            <div className="small text-muted">{title("netAfterExpenses")}</div>
            <div className="fs-5 fw-bold mt-1">{money(Number(data?.revenue||0)-Number(data?.expenses||0))}</div>
          </div></div>
        </div>
      )}

      {isVisible("quickActions")&&(
        <div className="col-lg-4" style={style("quickActions")}>
          <div className="card border-0 shadow-sm h-100"><div className="card-body">
            <h5 className="mb-3">{title("quickActions")}</h5>
            <div className="d-grid gap-2">
              <button className="btn btn-outline-primary" onClick={()=>navigate("/bulk-payment")}>Record a payment</button>
              <button className="btn btn-outline-secondary" onClick={()=>navigate("/add-expense")}>Add Expense</button>
              <button className="btn btn-outline-success" onClick={()=>navigate("/calendar")}>Add a reminder</button>
              <button className="btn btn-outline-dark" onClick={()=>navigate("/profile")}>Company Settings</button>
            </div>
          </div></div>
        </div>
      )}
    </div>
  </div>;
}
